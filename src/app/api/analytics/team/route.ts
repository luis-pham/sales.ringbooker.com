import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { profile } = await getSessionUser();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, email, full_name, role, is_active, salon_leads(status)");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
