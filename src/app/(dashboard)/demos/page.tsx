import Link from "next/link";
import { DemoCard } from "@/components/demo/DemoCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RingbookerDemo } from "@/types";

type DemoRow = RingbookerDemo & {
  salon_leads?: { id: string; name: string; status: string } | null;
};

export default async function DemosPage() {
  const profile = await requireAuth();
  let query = createAdminClient()
    .from("ringbooker_demos")
    .select("*, salon_leads(id, name, status)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (profile.role !== "admin") query = query.eq("created_by", profile.id);
  const { data: demos } = await query;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Demos</h1>
        <p className="text-sm text-muted">Prepared RingBooker demo URLs for salon outreach.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {((demos ?? []) as DemoRow[]).map((demo) => (
          <div key={demo.id} className="space-y-2">
            <Link href={`/leads/${demo.lead_id}`} className="text-sm font-medium text-violet-700">
              {demo.salon_name}
            </Link>
            <DemoCard demo={demo} />
          </div>
        ))}
        {(demos ?? []).length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No demos yet</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted">Priority 1 leads will get demos automatically after scoring.</CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
