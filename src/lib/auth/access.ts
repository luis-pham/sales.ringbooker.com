import type { Profile } from "@/types";

type SupabaseAdmin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

export async function canAccessLead(adminClient: SupabaseAdmin, leadId: string, profile: Profile) {
  if (profile.role === "admin") return true;
  const { data } = await adminClient
    .from("salon_leads")
    .select("assigned_to")
    .eq("id", leadId)
    .maybeSingle<{ assigned_to: string | null }>();
  return data?.assigned_to === profile.id;
}

export async function requireLeadAccess(adminClient: SupabaseAdmin, leadId: string, profile: Profile) {
  const allowed = await canAccessLead(adminClient, leadId, profile);
  if (!allowed) throw new Error("forbidden");
}

export async function canAccessDemo(adminClient: SupabaseAdmin, demoId: string, profile: Profile) {
  const { data } = await adminClient
    .from("ringbooker_demos")
    .select("lead_id, created_by")
    .eq("id", demoId)
    .maybeSingle<{ lead_id: string; created_by: string | null }>();
  if (!data) return false;
  if (profile.role === "admin" || data.created_by === profile.id) return true;
  return canAccessLead(adminClient, data.lead_id, profile);
}
