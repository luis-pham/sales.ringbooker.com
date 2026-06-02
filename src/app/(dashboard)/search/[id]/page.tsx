import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function SearchRunPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const adminClient = createAdminClient();
  const [{ data: run }, { data: leads }, { data: jobs }] = await Promise.all([
    adminClient.from("lead_search_runs").select("*").eq("id", id).single(),
    adminClient.from("salon_leads").select("*").eq("search_run_id", id).order("created_at", { ascending: false }),
    adminClient.from("jobs").select("*").contains("payload", { searchRunId: id }).order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">{run ? `${run.city}, ${run.state}` : "Search run"}</h1>
        <p className="text-sm text-muted">Status: {run?.status ?? "unknown"}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Found", run?.total_found ?? 0],
          ["Imported", run?.total_imported ?? 0],
          ["Skipped", run?.total_skipped ?? 0],
          ["Duplicates", run?.total_duplicate ?? 0],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted">{label}</div>
              <div className="mt-1 text-2xl font-semibold text-text">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Imported leads</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {(leads ?? []).map((lead) => (
            <Link key={lead.id} href={`/leads/${lead.id}`} className="block px-4 py-3 hover:bg-slate-50">
              <div className="font-medium text-text">{lead.name}</div>
              <div className="text-sm text-muted">{lead.address ?? lead.phone ?? "No contact"}</div>
            </Link>
          ))}
          {(leads ?? []).length === 0 ? <div className="p-4 text-sm text-muted">No leads imported yet.</div> : null}
        </CardContent>
      </Card>
      {jobs?.length ? <p className="text-xs text-muted">{jobs.length} queue job(s) linked to this run.</p> : null}
    </div>
  );
}
