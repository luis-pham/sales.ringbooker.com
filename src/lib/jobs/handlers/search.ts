import { enqueueJob } from "@/lib/jobs/queue";
import { searchGoogleMaps } from "@/lib/providers/serper";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadSearchRun } from "@/types";

export type SearchRunPayload = {
  searchRunId: string;
};

const CHAIN_PATTERNS = [
  /great clips/i,
  /supercuts/i,
  /sport clips/i,
  /fantastic sams/i,
  /cost cutters/i,
  /regis salon/i,
  /hair cuttery/i,
  /floyd'?s/i,
  /roosters/i,
  /the barber shop/i,
  /ulta/i,
  /aveda/i,
  /jcpenney salon/i,
  /smartstyle/i,
  /visible changes/i,
  /drybar/i,
  /blo blow dry bar/i,
];

export function isChainSalon(name: string) {
  return CHAIN_PATTERNS.some((pattern) => pattern.test(name));
}

export async function handleSearchRun(payload: SearchRunPayload) {
  const { searchRunId } = payload;
  const adminClient = createAdminClient();

  const { data: run, error: runError } = await adminClient
    .from("lead_search_runs")
    .select("*")
    .eq("id", searchRunId)
    .single<LeadSearchRun>();

  if (runError || !run) throw new Error(`Search run not found: ${searchRunId}`);

  await adminClient
    .from("lead_search_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", searchRunId);

  try {
    const searchResult = await searchGoogleMaps({
      query: run.query,
      location: `${run.city}, ${run.state}`,
      country: run.country.toLowerCase(),
      limit: run.max_results,
    });

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;

    for (const lead of searchResult.results) {
      if (!lead.phone && !lead.website_url) {
        skipped += 1;
        continue;
      }
      if (isChainSalon(lead.name)) {
        skipped += 1;
        continue;
      }
      if (!lead.google_place_id) {
        skipped += 1;
        continue;
      }

      const { data: existing } = await adminClient
        .from("salon_leads")
        .select("id")
        .eq("google_place_id", lead.google_place_id)
        .maybeSingle<{ id: string }>();

      if (existing) {
        duplicates += 1;
        continue;
      }

      const { data: newLead, error: insertError } = await adminClient
        .from("salon_leads")
        .insert({
          ...lead,
          search_run_id: searchRunId,
          status: "new",
          city: lead.city ?? run.city,
          state: lead.state ?? run.state,
        })
        .select("id")
        .single<{ id: string }>();

      if (insertError || !newLead) {
        skipped += 1;
        continue;
      }

      const raw = searchResult.rawResults.find(
        (item) => item.placeId === lead.google_place_id || String(item.cid ?? "") === lead.google_place_id,
      );

      await adminClient.from("lead_source_snapshots").insert({
        lead_id: newLead.id,
        provider: run.provider,
        provider_id: lead.google_place_id,
        raw: raw ?? {},
      });

      await enqueueJob("enrich_lead", { leadId: newLead.id });
      imported += 1;
    }

    await adminClient
      .from("lead_search_runs")
      .update({
        status: "completed",
        total_found: searchResult.totalFound,
        total_imported: imported,
        total_skipped: skipped,
        total_duplicate: duplicates,
        estimated_cost_usd: searchResult.estimatedCostUsd,
        completed_at: new Date().toISOString(),
      })
      .eq("id", searchRunId);
  } catch (error) {
    await adminClient
      .from("lead_search_runs")
      .update({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        completed_at: new Date().toISOString(),
      })
      .eq("id", searchRunId);
    throw error;
  }
}
