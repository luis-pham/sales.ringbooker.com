import { createDemo } from "@/lib/demo/demo-service";
import { calculateScore } from "@/lib/scoring/scoring-engine";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InstagramSnapshot, SalonLead, WebsiteSnapshot } from "@/types";

export type ScoreLeadPayload = {
  leadId: string;
};

export async function handleScoreLead(payload: ScoreLeadPayload) {
  const adminClient = createAdminClient();
  const [{ data: lead }, { data: websiteSnapshot }, { data: instagramSnapshot }, { data: sourceSnapshot }] =
    await Promise.all([
      adminClient.from("salon_leads").select("*").eq("id", payload.leadId).single<SalonLead>(),
      adminClient.from("website_snapshots").select("*").eq("lead_id", payload.leadId).maybeSingle<WebsiteSnapshot>(),
      adminClient.from("instagram_snapshots").select("*").eq("lead_id", payload.leadId).maybeSingle<InstagramSnapshot>(),
      adminClient.from("lead_source_snapshots").select("raw").eq("lead_id", payload.leadId).order("created_at").limit(1).maybeSingle<{ raw: Record<string, unknown> }>(),
    ]);

  if (!lead) throw new Error(`Lead not found: ${payload.leadId}`);
  const result = calculateScore({ lead, websiteSnapshot, instagramSnapshot, sourceSnapshot });

  await adminClient.from("lead_scores").upsert(
    {
      lead_id: payload.leadId,
      score: result.score,
      priority: result.priority,
      factors: result.factors,
      tier: result.tier,
      tier_platform: result.tier_platform,
      tier_reason: result.tier_reason,
      recommended_pitch: result.recommended_pitch,
      scoring_version: result.scoring_version,
      scored_at: new Date().toISOString(),
    },
    { onConflict: "lead_id,scoring_version" },
  );

  const nextStatus = result.priority === 1 ? "outreach_ready" : "scored";
  await adminClient
    .from("salon_leads")
    .update({ status: nextStatus, scored_at: new Date().toISOString() })
    .eq("id", payload.leadId)
    .in("status", ["new", "enriching", "enriched", "scored", "outreach_ready"]);

  if (result.priority === 1) {
    await createDemo(payload.leadId, null).catch(() => null);
  }
}
