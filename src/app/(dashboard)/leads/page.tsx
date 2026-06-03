import { Suspense } from "react";
import { LeadListClient } from "./LeadListClient";
import { FilterBar } from "@/components/filters/FilterBar";
import { Pagination } from "@/components/filters/Pagination";
import { requireAuth } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "enriching", label: "Enriching" },
  { value: "enriched", label: "Enriched" },
  { value: "scored", label: "Scored" },
  { value: "outreach_ready", label: "Outreach ready" },
  { value: "dm_sent", label: "DM sent" },
  { value: "replied", label: "Replied" },
  { value: "demo_shared", label: "Demo shared" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
  { value: "disqualified", label: "Disqualified" },
];

const SCORE_OPTIONS = [
  { value: "1", label: "Priority 1" },
  { value: "2", label: "Priority 2" },
  { value: "3", label: "Priority 3" },
];

const TIER_OPTIONS = [
  { value: "A", label: "Direct booking" },
  { value: "B", label: "Link booking" },
  { value: "C", label: "Capture only" },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string; status?: string; score?: string; tier?: string;
    page?: string; per_page?: string;
  }>;
}) {
  const profile = await requireAuth();
  const {
    date = "all", status = "all",
    score = "all", tier = "all",
    page = "1", per_page = "25",
  } = await searchParams;

  const perPage = Math.min(200, Math.max(10, Number(per_page) || 25));
  const pageNum = Math.max(1, Number(page) || 1);
  const offset = (pageNum - 1) * perPage;

  // Use !inner join only when filtering by score/tier to avoid filtering out unscored leads
  const needsScoreJoin = score !== "all" || tier !== "all";
  const selectClause = needsScoreJoin
    ? "*, lead_scores!inner(score, priority, tier, tier_platform)"
    : "*, lead_scores(score, priority, tier, tier_platform)";

  const adminClient = createAdminClient();

  let query = adminClient
    .from("salon_leads")
    .select(selectClause)
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1);

  let countQuery = adminClient
    .from("salon_leads")
    .select(needsScoreJoin ? "lead_scores!inner(priority, tier)" : "id", { count: "exact", head: true });

  if (profile.role !== "admin") {
    query = query.eq("assigned_to", profile.id);
    countQuery = countQuery.eq("assigned_to", profile.id);
  }
  if (status !== "all") {
    query = query.eq("status", status);
    countQuery = countQuery.eq("status", status);
  }
  if (date !== "all") {
    const since = dateToISO(date);
    query = query.gte("created_at", since);
    countQuery = countQuery.gte("created_at", since);
  }
  if (score !== "all") {
    query = query.eq("lead_scores.priority", Number(score));
    countQuery = countQuery.eq("lead_scores.priority", Number(score));
  }
  if (tier !== "all") {
    query = query.eq("lead_scores.tier", tier);
    countQuery = countQuery.eq("lead_scores.tier", tier);
  }

  const [{ data: leads }, { count }] = await Promise.all([query, countQuery]);
  const total = count ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Leads</h1>
        <p className="text-sm text-muted">Prioritized salons for RingBooker outreach.</p>
      </div>
      <Suspense>
        <FilterBar
          selects={[
            { paramKey: "score", placeholder: "All scores", options: SCORE_OPTIONS },
            { paramKey: "tier", placeholder: "All integrations", options: TIER_OPTIONS },
            { paramKey: "status", placeholder: "All statuses", options: STATUS_OPTIONS },
          ]}
        />
      </Suspense>
      <div className="rounded-lg border border-border bg-surface">
        <LeadListClient leads={(leads ?? []) as any[]} />
        <Suspense>
          <Pagination total={total} page={pageNum} perPage={perPage} />
        </Suspense>
      </div>
    </div>
  );
}

function dateToISO(range: string): string {
  const now = new Date();
  if (range === "today") { const d = new Date(now); d.setHours(0,0,0,0); return d.toISOString(); }
  if (range === "week") return new Date(now.getTime() - 7 * 86400000).toISOString();
  if (range === "month") return new Date(now.getTime() - 30 * 86400000).toISOString();
  return new Date(0).toISOString();
}
