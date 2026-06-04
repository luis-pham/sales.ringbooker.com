import { extractInstagramHandle } from "@/lib/enrichment/website-crawler";
import { calculateScore } from "@/lib/scoring/scoring-engine";
import { enqueueJob } from "@/lib/jobs/queue";
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

  // Demo creation is deferred to the nightly window (US asleep) right before the
  // daily assignment cycle — see topUpPoolDemos() in the worker. We no longer
  // create demos here at scoring time.

  // Instagram fetch strategy (cost optimization):
  //   P1 → individual immediate fetch (high value, demo needs the data now)
  //   P2 → deferred to hourly batch (handleInstagramBatchQueue) — ~40% cheaper per profile
  //   P3 → skipped entirely
  if (lead.instagram_url && !instagramSnapshot) {
    if (result.priority === 1) {
      const handle = extractInstagramHandle(lead.instagram_url);
      if (handle) {
        console.log(`[Score] Queuing immediate Instagram for P1 lead ${payload.leadId}: @${handle}`);
        await enqueueJob("enrich_instagram", { leadId: payload.leadId, instagramHandle: handle });
      }
    } else if (result.priority === 2) {
      console.log(`[Score] P2 lead ${payload.leadId} deferred to hourly Instagram batch`);
    } else {
      console.log(`[Score] Skip Instagram for P3 lead ${payload.leadId}`);
    }
  }
}
