import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity } from "@/lib/utils/security";

const schema = z.object({ assigned_to: z.string().uuid().nullable() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = enforceMutationSecurity(request, { key: "lead:assign", limit: 60, windowMs: 60_000 });
  if (security) return security;
  const { user, profile } = await getSessionUser();
  if (!user || profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { id } = await params;
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("salon_leads")
    .update({ assigned_to: parsed.data.assigned_to })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await adminClient.from("outreach_events").insert({
    lead_id: id,
    type: "assigned",
    new_status: data.status,
    created_by: user.id,
    metadata: { assigned_to: parsed.data.assigned_to },
  });
  return NextResponse.json({ data });
}
