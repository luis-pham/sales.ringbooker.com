import { Suspense } from "react";
import Link from "next/link";
import { SearchPageClient } from "./SearchPageClient";
import { FilterBar } from "@/components/filters/FilterBar";
import { Pagination } from "@/components/filters/Pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

const SEARCH_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; status?: string; page?: string; per_page?: string }>;
}) {
  await requireRole("admin");
  const { date = "all", status = "all", page = "1", per_page = "25" } = await searchParams;

  const perPage = Math.min(200, Math.max(10, Number(per_page) || 25));
  const pageNum = Math.max(1, Number(page) || 1);
  const offset = (pageNum - 1) * perPage;

  let countQuery = createAdminClient()
    .from("lead_search_runs")
    .select("id", { count: "exact", head: true });

  let query = createAdminClient()
    .from("lead_search_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1);

  if (status !== "all") {
    query = query.eq("status", status);
    countQuery = countQuery.eq("status", status);
  }
  if (date !== "all") {
    const since = dateToISO(date);
    query = query.gte("created_at", since);
    countQuery = countQuery.gte("created_at", since);
  }

  const [{ data: runs }, { count }] = await Promise.all([query, countQuery]);
  const total = count ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Search</h1>
        <p className="text-sm text-muted">Find hair salons from Google Maps via Serper.</p>
      </div>
      <SearchPageClient />
      <div className="space-y-3">
        <Suspense>
          <FilterBar
            selects={[{ paramKey: "status", placeholder: "All statuses", options: SEARCH_STATUSES }]}
          />
        </Suspense>
        <Card>
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-border text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Found</th>
                    <th className="px-4 py-3">Imported</th>
                    <th className="px-4 py-3">Skipped</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(runs ?? []).map((run) => (
                    <tr key={run.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                      <td className="px-4 py-3">
                        <Link href={`/search/${run.id}`} prefetch={false} className="font-medium text-violet-700 hover:underline">
                          {run.city}, {run.state}
                        </Link>
                        {run.query_variation && run.query_variation !== run.query && (
                          <div className="text-xs text-muted">{run.query_variation}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          run.status === "completed" ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                          run.status === "running"   ? "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" :
                          run.status === "failed"    ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
                          "bg-surface-muted text-muted"
                        }`}>{run.status}</span>
                      </td>
                      <td className="px-4 py-3 font-medium">{run.total_found ?? "—"}</td>
                      <td className="px-4 py-3 text-green-700 dark:text-green-400 font-medium">{run.total_imported ?? 0}</td>
                      <td className="px-4 py-3 text-muted">{(run.total_skipped ?? 0) + (run.total_duplicate ?? 0)}</td>
                      <td className="px-4 py-3 text-muted">{new Date(run.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {(runs ?? []).length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted text-sm">No runs found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Suspense>
              <Pagination total={total} page={pageNum} perPage={perPage} />
            </Suspense>
          </CardContent>
        </Card>
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
