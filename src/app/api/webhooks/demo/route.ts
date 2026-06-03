/**
 * POST /api/webhooks/demo
 *
 * Receives per-event demo tracking from ringbooker.com:
 *   { slug, event: "play" | "progress" | "complete", pct, timestamp, duration_seconds? }
 *
 * Auth: x-ringbooker-webhook-secret header (shared secret).
 *
 * Side-effects:
 *  - Upserts a demo_session row for this slug+started_at
 *  - Updates ringbooker_demos view_count + last_viewed_at
 *  - Auto-advances lead sales_stage:
 *      first play  → sent → viewed
 *      2+ plays or 80%+ → viewed → hot
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, verifySharedSecret } from "@/lib/utils/security";
import type { DemoWebhookPayload } from "@/types";

const schema = z.object({
  slug: z.string().min(1),
  event: z.enum(["play", "progress", "complete"]),
  pct: z.number().min(0).max(100),
  timestamp: z.string(),
  duration_seconds: z.number().optional(),
});

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { key: "webhook:demo", limit: 300, windowMs: 60_000 });
  if (limited) return limited;

  if (!env.ringbookerWebhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }
  const secret = request.headers.get("x-ringbooker-webhook-secret");
  if (!verifySharedSecret(secret, env.ringbookerWebhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as DemoWebhookPayload | null;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  const { slug, event, pct, timestamp, duration_seconds } = parsed.data;
  const adminClient = createAdminClient();

  // Look up demo by slug
  const { data: demo } = await adminClient
    .from("ringbooker_demos")
    .select("id, lead_id, view_count")
    .eq("demo_slug", slug)
    .maybeSingle<{ id: string; lead_id: string; view_count: number }>();

  if (!demo) {
    // Slug not linked yet — accept gracefully
    return NextResponse.json({ data: { ok: true, note: "slug not found" } });
  }

  const startedAt = new Date(timestamp).toISOString();

  // Upsert session: one row per (demo_id, started_at minute) so rapid progress events merge
  const sessionMinute = new Date(timestamp);
  sessionMinute.setSeconds(0, 0);
  const sessionKey = sessionMinute.toISOString();

  const { data: existing } = await adminClient
    .from("demo_sessions")
    .select("id, pct_reached")
    .eq("demo_id", demo.id)
    .gte("started_at", sessionKey)
    .lt("started_at", new Date(sessionMinute.getTime() + 60_000).toISOString())
    .maybeSingle<{ id: string; pct_reached: number }>();

  if (existing) {
    // Update if new pct is higher or session now complete
    if (pct > existing.pct_reached || event === "complete") {
      await adminClient
        .from("demo_sessions")
        .update({
          pct_reached: Math.max(pct, existing.pct_reached),
          is_complete: event === "complete",
          duration_seconds: duration_seconds ?? undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }
  } else {
    await adminClient.from("demo_sessions").insert({
      demo_id: demo.id,
      lead_id: demo.lead_id,
      slug,
      started_at: startedAt,
      hour_of_day: new Date(timestamp).getUTCHours(),
      pct_reached: pct,
      is_complete: event === "complete",
      duration_seconds: duration_seconds ?? null,
    });
  }

  // Update demo aggregate counters
  const newViewCount = event === "play" ? (demo.view_count ?? 0) + 1 : (demo.view_count ?? 0);
  await adminClient
    .from("ringbooker_demos")
    .update({
      view_count: event === "play" ? newViewCount : undefined,
      last_viewed_at: new Date().toISOString(),
      status: event === "complete" ? "completed" : "viewed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", demo.id);

  // Auto-advance sales_stage
  const { data: lead } = await adminClient
    .from("salon_leads")
    .select("id, sales_stage")
    .eq("id", demo.lead_id)
    .maybeSingle<{ id: string; sales_stage: string }>();

  if (lead) {
    let newStage: string | null = null;
    const isHot = newViewCount >= 2 || pct >= 80;

    if (event === "play" && lead.sales_stage === "sent") {
      newStage = "viewed";
    }
    if (isHot && lead.sales_stage === "viewed") {
      newStage = "hot";
    }

    if (newStage) {
      await adminClient
        .from("salon_leads")
        .update({ sales_stage: newStage, updated_at: new Date().toISOString() })
        .eq("id", demo.lead_id);

      await adminClient.from("outreach_events").insert({
        lead_id: demo.lead_id,
        demo_id: demo.id,
        type: newStage === "viewed" ? "demo_viewed" : "demo_completed",
        notes: `Auto-advanced to "${newStage}" via demo webhook (${pct}% watched)`,
        metadata: { slug, event, pct, sales_stage: newStage },
        new_status: newStage,
        created_by: null,
      });
    }
  }

  return NextResponse.json({ data: { ok: true } });
}
