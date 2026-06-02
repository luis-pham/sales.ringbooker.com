import { PipelineClient } from "./PipelineClient";
import { Card, CardContent } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function PipelinePage() {
  const profile = await requireAuth();
  let query = createAdminClient()
    .from("salon_leads")
    .select("id, name, status, city, state")
    .in("status", ["outreach_ready", "dm_sent", "replied", "demo_shared", "converted"])
    .order("updated_at", { ascending: false })
    .limit(100);
  if (profile.role !== "admin") query = query.eq("assigned_to", profile.id);
  const { data: leads } = await query;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Pipeline</h1>
        <p className="text-sm text-muted">Track DM sent to converted.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Active leads", leads?.length ?? 0],
          ["Replied", leads?.filter((lead) => lead.status === "replied").length ?? 0],
          ["Demo shared", leads?.filter((lead) => lead.status === "demo_shared").length ?? 0],
          ["Converted", leads?.filter((lead) => lead.status === "converted").length ?? 0],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted">{label}</div>
              <div className="mt-1 text-2xl font-semibold text-text">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <PipelineClient leads={(leads ?? []) as any[]} />
    </div>
  );
}
