import { Suspense } from "react";
import { LeadListClient } from "./LeadListClient";
import { FilterBar } from "@/components/filters/FilterBar";
import { Pagination } from "@/components/filters/Pagination";
import { requireAuth } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

const LEAD_STATUSES = [
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

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; status?: string; page?: string; per_page?: string }>;
}) {
  const profile = await requireAuth();
  const { date = "all", status = "all", page = "1", per_page = "25" } = await searchParams;

  const perPage = Math.min(200, Math.max(10, Number(per_page) || 25));
  const pageNum = Math.max(1, Number(page) || 1);
  const offset = (pageNum - 1) * perPage;

  let countQuery = createAdminClient()
    .from("salon_leads")
    .select("id", { count: "exact", head: true });

  let query = createAdminClient()
    .from("salon_leads")
    .select("*, lead_scores(*)")
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1);

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

  const [{ data: leads }, { count }] = await Promise.all([query, countQuery]);
  const total = count ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Leads</h1>
        <p className="text-sm text-muted">Prioritized salons for RingBooker outreach.</p>
      </div>
      <Suspense>
        <FilterBar statusOptions={LEAD_STATUSES} />
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
