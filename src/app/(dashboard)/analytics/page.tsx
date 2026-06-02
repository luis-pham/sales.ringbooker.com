import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AnalyticsPage() {
  await requireRole("admin");
  const adminClient = createAdminClient();
  const [{ data: stats }, { data: byCity }, { data: scores }] = await Promise.all([
    adminClient.rpc("get_pipeline_stats"),
    adminClient.from("salon_leads").select("city, status"),
    adminClient.from("lead_scores").select("score, priority, tier"),
  ]);

  const cityCounts = new Map<string, number>();
  for (const row of byCity ?? []) {
    cityCounts.set(row.city ?? "Unknown", (cityCounts.get(row.city ?? "Unknown") ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Analytics</h1>
        <p className="text-sm text-muted">Pipeline health and lead scoring mix.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Total leads", (stats as any)?.total ?? 0],
          ["DM sent", (stats as any)?.dm_sent ?? 0],
          ["Converted", (stats as any)?.converted ?? 0],
          ["Conversion", `${(stats as any)?.conversion_rate ?? 0}%`],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted">{label}</div>
              <div className="mt-1 text-2xl font-semibold text-text">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By city</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...cityCounts.entries()].slice(0, 12).map(([city, count]) => (
              <div key={city} className="flex justify-between text-sm">
                <span>{city}</span>
                <span className="text-muted">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Score mix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Priority 1</span>
              <span className="text-muted">{scores?.filter((row) => row.priority === 1).length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Tier A</span>
              <span className="text-muted">{scores?.filter((row) => row.tier === "A").length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Average score</span>
              <span className="text-muted">
                {scores?.length ? Math.round(scores.reduce((sum, row) => sum + row.score, 0) / scores.length) : 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
