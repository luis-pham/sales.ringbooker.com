import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { profile } = await getSessionUser();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminClient = createAdminClient();
  const { data: profiles, error } = await adminClient
    .from("profiles")
    .select("id, email, full_name, role, is_active");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { count: leadCount } = await adminClient
    .from("salon_leads")
    .select("id", { count: "exact", head: true })
    .in("assigned_to", (profiles ?? []).map((p) => p.id));
  return NextResponse.json({ data: { profiles: profiles ?? [], leadCount: leadCount ?? 0 } });
}
