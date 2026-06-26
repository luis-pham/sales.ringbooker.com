import { Suspense } from "react";
import Link from "next/link";
import { FilterBar } from "@/components/filters/FilterBar";
import { Pagination } from "@/components/filters/Pagination";
import { StatusBadge } from "@/components/leads/StatusBadge";
import { requireAuth } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

const DEMO_STATUSES = [
  { value: "prepared", label: "Prepared" },
  { value: "shared", label: "Shared" },
  { value: "viewed", label: "Viewed" },
  { value: "completed", label: "Completed" },
  { value: "expired", label: "Expired" },
];

export default async function DemosPage({
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
    .from("ringbooker_demos")
    .select("id", { count: "exact", head: true });

  let query = createAdminClient()
    .from("ringbooker_demos")
    .select("*, salon_leads(id, name, status)")
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1);

  if (profile.role !== "admin") {
    query = query.eq("created_by", profile.id);
    countQuery = countQuery.eq("created_by", profile.id);
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

  const [{ data: demos }, { count }] = await Promise.all([query, countQuery]);
  const total = count ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Demos</h1>
        <p className="text-sm text-muted">Prepared RingBooker demo URLs for salon outreach.</p>
      </div>

      <Suspense>
        <FilterBar
            selects={[{ paramKey: "status", placeholder: "All statuses", options: DEMO_STATUSES }]}
          />
      </Suspense>

      <div className="rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3">Salon</th>
                <th className="px-4 py-3">Lead status</th>
                <th className="px-4 py-3">Demo status</th>
                <th className="px-4 py-3">Views</th>
                <th className="px-4 py-3">Demo URL</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {(demos ?? []).map((demo) => (
                <tr key={demo.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${demo.lead_id}`} prefetch={false} className="font-medium text-violet-700 hover:underline">
                      {demo.salon_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {demo.salon_leads?.status ? (
                      <StatusBadge status={demo.salon_leads.status as any} />
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <DemoStatusBadge status={demo.status} />
                  </td>
                  <td className="px-4 py-3 text-muted">{demo.view_count ?? 0}</td>
                  <td className="px-4 py-3">
                    {demo.demo_url ? (
                      <a
                        href={demo.demo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-violet-700 hover:underline"
                      >
                        Open ↗
                      </a>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {new Date(demo.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {(demos ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                    No demos found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Suspense>
          <Pagination total={total} page={pageNum} perPage={perPage} />
        </Suspense>
      </div>
    </div>
  );
}

function DemoStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    prepared: "bg-surface-muted text-muted",
    shared: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    viewed: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    completed: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    expired: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-surface-muted text-muted"}`}>
      {status}
    </span>
  );
}

function dateToISO(range: string): string {
  const now = new Date();
  if (range === "today") { const d = new Date(now); d.setHours(0,0,0,0); return d.toISOString(); }
  if (range === "week") return new Date(now.getTime() - 7 * 86400000).toISOString();
  if (range === "month") return new Date(now.getTime() - 30 * 86400000).toISOString();
  return new Date(0).toISOString();
}
