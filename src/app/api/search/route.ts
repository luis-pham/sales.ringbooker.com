import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { VERTICAL_QUERIES } from "@/lib/config/search-targets";
import { getSessionUser } from "@/lib/auth/helpers";
import { enqueueJob } from "@/lib/jobs/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity, enforceRateLimit } from "@/lib/utils/security";

const verticalSchema = z.enum(Object.keys(VERTICAL_QUERIES) as [keyof typeof VERTICAL_QUERIES, ...(keyof typeof VERTICAL_QUERIES)[]]);

const searchSchema = z.object({
  query: z.string().trim().min(2).default("hair salons"),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  country: z.string().trim().default("US"),
  max_results: z.coerce.number().int().min(10).max(500).default(50),
  vertical: verticalSchema.default("hair_salon"),
});

export async function POST(request: NextRequest) {
  const security = enforceMutationSecurity(request, { key: "search:post", limit: 10, windowMs: 60_000 });
  if (security) return security;

  const { user, profile } = await getSessionUser();
  if (!user || profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = searchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const adminClient = createAdminClient();
  const { data: searchRun, error } = await adminClient
    .from("lead_search_runs")
    .insert({
      ...parsed.data,
      query_variation: parsed.data.query,
      created_by: user.id,
      provider: "serper",
      status: "pending",
    })
    .select()
    .single();
  if (error || !searchRun) return NextResponse.json({ error: error?.message ?? "Search run failed" }, { status: 500 });

  const jobId = await enqueueJob("search_run", { searchRunId: searchRun.id });
  return NextResponse.json({ data: { searchRunId: searchRun.id, jobId, status: "queued" } });
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { key: "search:get", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const { profile } = await getSessionUser();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("lead_search_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
