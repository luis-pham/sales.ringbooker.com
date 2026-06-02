import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/utils/security";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { key: "leads:get", limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { profile } = await getSessionUser();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const city = searchParams.get("city");
  const q = searchParams.get("q");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

  const adminClient = createAdminClient();
  let query = adminClient
    .from("salon_leads")
    .select("*, lead_scores(*), ringbooker_demos(*)", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (profile.role !== "admin") query = query.eq("assigned_to", profile.id);
  if (status) query = query.eq("status", status);
  if (city) query = query.eq("city", city);
  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}
