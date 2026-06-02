import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireLeadAccess } from "@/lib/auth/access";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity, enforceRateLimit } from "@/lib/utils/security";

const updateSchema = z.object({
  status: z.enum([
    "dm_sent",
    "replied",
    "demo_shared",
    "demo_viewed",
    "demo_completed",
    "follow_up_needed",
    "converted",
    "lost",
    "disqualified",
  ]).optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(_request, { key: "lead:get", limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { profile } = await getSessionUser();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("salon_leads")
    .select("*, lead_scores(*), website_snapshots(*), instagram_snapshots(*), ringbooker_demos(*), outreach_events(*), follow_ups(*)")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  if (profile.role !== "admin" && data.assigned_to !== profile.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = enforceMutationSecurity(request, { key: "lead:patch", limit: 60, windowMs: 60_000 });
  if (security) return security;
  const { profile } = await getSessionUser();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { id } = await params;
  const adminClient = createAdminClient();
  try {
    await requireLeadAccess(adminClient, id, profile);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { data, error } = await adminClient
    .from("salon_leads")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
