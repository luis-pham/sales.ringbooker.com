import Link from "next/link";
import { SearchPageClient } from "./SearchPageClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function SearchPage() {
  await requireRole("admin");
  const { data: runs } = await createAdminClient()
    .from("lead_search_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Search</h1>
        <p className="text-sm text-muted">Find hair salons from Google Maps via Serper.</p>
      </div>
      <SearchPageClient />
      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Imported</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((run) => (
                <tr key={run.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/search/${run.id}`} className="font-medium text-violet-700">
                      {run.city}, {run.state}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{run.status}</td>
                  <td className="px-4 py-3">{run.total_imported ?? 0}</td>
                  <td className="px-4 py-3 text-muted">{new Date(run.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
