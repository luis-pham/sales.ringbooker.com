/**
 * POST /api/webhooks/lifecycle
 *
 * Bottom-of-funnel signals from ringbooker.com, keyed by the sales lead id that
 * was stamped on the shop at signup (deterministic attribution):
 *   { salesLeadId, event: "signedup" | "trial" | "converted" | "churned", timestamp? }
 *
 * Auth: x-ringbooker-webhook-secret header (same shared secret as the demo webhook).
 *
 * Advances salon_leads.sales_stage forward-only (never downgrades) and logs a
 * status_changed outreach event, mirroring the demo webhook's auto-advance.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, verifySharedSecret } from "@/lib/utils/security";
import { STAGE_ORDER } from "@/lib/stageConfig";
import type { LeadStage } from "@/types";

const schema = z.object({
  salesLeadId: z.string().uuid(),
  event: z.enum(["signedup", "trial", "converted", "churned"]),
  timestamp: z.string().optional(),
});

const EVENT_TO_STAGE: Record<z.infer<typeof schema>["event"], LeadStage> = {
  signedup: "signedup",
  trial: "trial",
  converted: "converted",
  churned: "churned",
};

// Stages a lead must already be in for a churn signal to apply (they were a
// customer / in-flight). Prevents a stray churn on a lead that never signed up.
const CHURNABLE_FROM: LeadStage[] = ["signedup", "onboarding", "trial", "converted"];

function idx(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage as LeadStage);
  return i === -1 ? 0 : i;
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { key: "webhook:lifecycle", limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  if (!env.ringbookerWebhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }
  const secret = request.headers.get("x-ringbooker-webhook-secret");
  if (!verifySharedSecret(secret, env.ringbookerWebhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }
  const { salesLeadId, event } = parsed.data;
  const newStage = EVENT_TO_STAGE[event];

  const adminClient = createAdminClient();
  const { data: lead } = await adminClient
    .from("salon_leads")
    .select("id, sales_stage")
    .eq("id", salesLeadId)
    .maybeSingle<{ id: string; sales_stage: string | null }>();

  // Lead not found (or detached) — accept gracefully so ringbooker doesn't retry forever.
  if (!lead) return NextResponse.json({ data: { ok: true, note: "lead not found" } });

  const current = lead.sales_stage ?? "ready";

  // Decide whether this signal should move the stage.
  const apply =
    event === "churned"
      ? CHURNABLE_FROM.includes(current as LeadStage)
      : idx(newStage) > idx(current); // forward-only; never downgrade

  if (!apply || current === newStage) {
    return NextResponse.json({ data: { ok: true, applied: false, stage: current } });
  }

  await adminClient
    .from("salon_leads")
    .update({ sales_stage: newStage, updated_at: new Date().toISOString() })
    .eq("id", salesLeadId);

  await adminClient.from("outreach_events").insert({
    lead_id: salesLeadId,
    type: "status_changed",
    notes: `Auto-advanced to "${newStage}" via ringbooker lifecycle webhook`,
    metadata: { sales_stage: newStage, lifecycle_event: event, source: "ringbooker_lifecycle" },
    new_status: newStage,
    created_by: null,
  });

  return NextResponse.json({ data: { ok: true, applied: true, stage: newStage } });
}
