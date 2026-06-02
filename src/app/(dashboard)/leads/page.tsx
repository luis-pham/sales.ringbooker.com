import { LeadListClient } from "./LeadListClient";
import { requireAuth } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function LeadsPage() {
  const profile = await requireAuth();
  let query = createAdminClient()
    .from("salon_leads")
    .select("*, lead_scores(*)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (profile.role !== "admin") query = query.eq("assigned_to", profile.id);
  const { data: leads } = await query;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Leads</h1>
        <p className="text-sm text-muted">Prioritized salons for RingBooker outreach.</p>
      </div>
      <LeadListClient leads={(leads ?? []) as any[]} />
    </div>
  );
}
