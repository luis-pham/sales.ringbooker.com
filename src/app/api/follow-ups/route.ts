import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireLeadAccess } from "@/lib/auth/access";
import { getSessionUser } from "@/lib/auth/helpers";
import { scheduleFollowUp } from "@/lib/outreach/outreach-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity, enforceRateLimit } from "@/lib/utils/security";

const schema = z.object({
  leadId: z.string().uuid(),
  assignedTo: z.string().uuid(),
  scheduledFor: z.string().datetime(),
  type: z.enum(["dm_followup", "share_demo", "check_viewed", "pricing_call", "close"]),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { key: "followups:get", limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { profile } = await getSessionUser();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const adminClient = createAdminClient();
  let query = adminClient
    .from("follow_ups")
    .select("*, salon_leads(name, status)")
    .order("scheduled_for", { ascending: true })
    .limit(100);
  if (profile.role !== "admin") query = query.eq("assigned_to", profile.id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const security = enforceMutationSecurity(request, { key: "followups:post", limit: 60, windowMs: 60_000 });
  if (security) return security;
  const { user, profile } = await getSessionUser();
  if (!user || !profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    await requireLeadAccess(createAdminClient(), parsed.data.leadId, profile);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile.role !== "admin" && parsed.data.assignedTo !== profile.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = await scheduleFollowUp({
    leadId: parsed.data.leadId,
    assignedTo: parsed.data.assignedTo,
    scheduledFor: new Date(parsed.data.scheduledFor),
    type: parsed.data.type,
    notes: parsed.data.notes,
    createdBy: user.id,
  });
  return NextResponse.json({ data: { id } });
}
