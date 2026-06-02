import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireLeadAccess } from "@/lib/auth/access";
import { getSessionUser } from "@/lib/auth/helpers";
import { logOutreachEvent } from "@/lib/outreach/outreach-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity, enforceRateLimit } from "@/lib/utils/security";

const schema = z.object({
  type: z.enum([
    "dm_sent",
    "email_sent",
    "demo_shared",
    "demo_viewed",
    "demo_completed",
    "reply_received",
    "follow_up_sent",
    "call_completed",
    "converted",
    "lost",
    "disqualified",
    "note",
  ]),
  channel: z.string().optional(),
  notes: z.string().optional(),
  demoId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const limited = enforceRateLimit(_request, { key: "outreach:get", limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { profile } = await getSessionUser();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { leadId } = await params;
  const adminClient = createAdminClient();
  try {
    await requireLeadAccess(adminClient, leadId, profile);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { data, error } = await adminClient
    .from("outreach_events")
    .select("*, outreach_evidence(*)")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const security = enforceMutationSecurity(request, { key: "outreach:post", limit: 90, windowMs: 60_000 });
  if (security) return security;
  const { user, profile } = await getSessionUser();
  if (!user || !profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { leadId } = await params;
  try {
    await requireLeadAccess(createAdminClient(), leadId, profile);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const eventId = await logOutreachEvent({ leadId, createdBy: user.id, ...parsed.data });
  return NextResponse.json({ data: { eventId } });
}
