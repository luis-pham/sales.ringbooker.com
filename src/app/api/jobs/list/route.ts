import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { profile } = await getSessionUser();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "all";
  const type = searchParams.get("type") ?? "all";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const perPage = Math.min(100, Math.max(10, Number(searchParams.get("per_page") ?? "25")));
  const offset = (page - 1) * perPage;

  const adminClient = createAdminClient();

  let query = adminClient
    .from("jobs")
    .select("id, type, status, attempts, max_attempts, error, next_run_at, created_at, updated_at, locked_by", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1);

  if (status !== "all") query = query.eq("status", status);
  if (type !== "all") query = query.eq("type", type);

  const { data: jobs, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Counts per status for the summary cards
  const { data: counts } = await adminClient
    .from("jobs")
    .select("status")
    .in("status", ["pending", "processing", "failed", "dead"]);

  const summary = { pending: 0, processing: 0, failed: 0, dead: 0 };
  for (const row of counts ?? []) {
    const s = row.status as keyof typeof summary;
    if (s in summary) summary[s]++;
  }

  return NextResponse.json({ data: { jobs: jobs ?? [], total: count ?? 0, summary } });
}
