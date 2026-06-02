import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logOutreachEvent } from "@/lib/outreach/outreach-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, verifySharedSecret } from "@/lib/utils/security";

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { key: "webhook:ringbooker", limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  if (!env.ringbookerWebhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }
  const secret = request.headers.get("x-ringbooker-webhook-secret");
  if (!verifySharedSecret(secret, env.ringbookerWebhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    demoId?: string;
    status?: "shared" | "viewed" | "completed";
  } | null;
  if (!body?.demoId || !body.status) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const adminClient = createAdminClient();
  const { data: demo } = await adminClient
    .from("ringbooker_demos")
    .update({ status: body.status })
    .eq("id", body.demoId)
    .select("id, lead_id")
    .single<{ id: string; lead_id: string }>();

  if (demo) {
    await logOutreachEvent({
      leadId: demo.lead_id,
      demoId: demo.id,
      type: body.status === "viewed" ? "demo_viewed" : body.status === "completed" ? "demo_completed" : "demo_shared",
      createdBy: null,
      notes: "RingBooker webhook event",
    }).catch(() => null);
  }

  return NextResponse.json({ data: { ok: true } });
}
