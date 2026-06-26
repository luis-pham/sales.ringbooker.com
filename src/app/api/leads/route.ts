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
    .select("id, name, phone, city, state, categories, website_url, facebook_url, instagram_url, sales_stage, assigned_to, created_at, updated_at, has_social, status, lead_scores(score, priority, tier, tier_platform), ringbooker_demos(id, demo_slug, view_count, last_viewed_at)", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("last_viewed_at", { referencedTable: "ringbooker_demos", ascending: false })
    .limit(1, { referencedTable: "ringbooker_demos" })
    .limit(limit);

  if (profile.role !== "admin") query = query.eq("assigned_to", profile.id);
  if (status) query = query.eq("status", status);
  if (city) query = query.eq("city", city);
  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}
