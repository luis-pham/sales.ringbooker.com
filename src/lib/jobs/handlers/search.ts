import { VERTICAL_QUERIES, type VerticalKey } from "@/lib/config/search-targets";
import { enqueueJob } from "@/lib/jobs/queue";
import { type NormalizedLead, type SerperResult, searchGoogleMaps } from "@/lib/providers/serper";
import { searchGridPoint } from "@/lib/providers/serper-grid";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadSearchRun } from "@/types";

export type SearchRunPayload = {
  searchRunId: string;
  vertical?: string;
  gridPoint?: string;
  gridIndex?: number;
  gridTotal?: number;
  queryVariation?: string;
  queryVariationIndex?: number;
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

  const vertical = resolveVertical(payload.vertical ?? run.vertical);
  const queryVariation = payload.queryVariation ?? run.query_variation ?? run.query;
  const gridPointValue = payload.gridPoint ?? run.grid_point ?? null;
  const gridIndex = payload.gridIndex ?? run.grid_index ?? 0;
  const gridTotal = payload.gridTotal ?? run.grid_total ?? 1;

  await adminClient
    .from("lead_search_runs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      vertical,
      grid_point: gridPointValue,
      grid_index: gridIndex,
      grid_total: gridTotal,
      query_variation: queryVariation,
    })
    .eq("id", searchRunId);

  try {
    const searchResult = gridPointValue
      ? await searchGridPoint({
          vertical,
          city: run.city,
          state: run.state,
          gridPoint: parseGridPoint(gridPointValue),
          gridIndex,
          gridTotal,
          queryVariation,
          queryVariationIndex: payload.queryVariationIndex ?? 0,
        })
      : await searchManualRun(run, queryVariation);

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;

    for (const lead of searchResult.leads) {
      if (!lead.phone && !lead.website_url && !lead.google_place_id) {
        skipped += 1;
        continue;
      }
      if (isChainSalon(lead.name)) {
        skipped += 1;
        continue;
      }
      if (lead.state && lead.state.toUpperCase() !== run.state.toUpperCase()) {
        skipped += 1;
        continue;
      }

      const insertResult = await insertLead(adminClient, lead, run, searchRunId);
      if (insertResult.status === "duplicate") {
        duplicates += 1;
        continue;
      }
      if (insertResult.status === "skipped") {
        skipped += 1;
        continue;
      }
      if (insertResult.status !== "inserted") {
        skipped += 1;
        continue;
      }

      const raw = findRawForLead(searchResult.rawResults, lead);
      await adminClient.from("lead_source_snapshots").insert({
        lead_id: insertResult.leadId,
        provider: run.provider,
        provider_id: lead.google_place_id ?? lead.phone ?? null,
        raw: raw ?? {},
      });

      await enqueueJob("enrich_lead", { leadId: insertResult.leadId });
      imported += 1;
    }

    await adminClient
      .from("lead_search_runs")
      .update({
        status: "completed",
        total_found: "totalFound" in searchResult ? searchResult.totalFound : searchResult.totalAfterDedup,
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

async function searchManualRun(run: LeadSearchRun, queryVariation: string) {
  const response = await searchGoogleMaps({
    query: queryVariation,
    location: `${run.city}, ${run.state}`,
    country: run.country.toLowerCase(),
    limit: run.max_results,
    searchRunId: run.id,
  });

  return {
    leads: response.results,
    totalFound: response.totalFound,
    estimatedCostUsd: response.estimatedCostUsd,
    rawResults: response.rawResults,
  };
}

async function insertLead(
  adminClient: ReturnType<typeof createAdminClient>,
  lead: NormalizedLead,
  run: LeadSearchRun,
  searchRunId: string,
): Promise<{ status: "inserted"; leadId: string } | { status: "duplicate" | "skipped" }> {
  const row = {
    ...lead,
    search_run_id: searchRunId,
    status: "new",
    city: lead.city ?? run.city,
    state: lead.state ?? run.state,
  };

  if (!lead.google_place_id && lead.phone && row.city) {
    const { data: existing } = await adminClient
      .from("salon_leads")
      .select("id")
      .eq("phone", lead.phone)
      .eq("city", row.city)
      .maybeSingle<{ id: string }>();
    if (existing) return { status: "duplicate" };
  }

  const request = lead.google_place_id
    ? adminClient.from("salon_leads").upsert(row, { ignoreDuplicates: true, onConflict: "google_place_id" })
    : adminClient.from("salon_leads").insert(row);

  const { data, error } = await request.select("id").maybeSingle<{ id: string }>();

  if (error) {
    if (isConflictError(error)) return { status: "duplicate" };
    return { status: "skipped" };
  }
  if (!data?.id) return { status: "duplicate" };
  return { status: "inserted", leadId: data.id };
}

function resolveVertical(value: string | null | undefined): VerticalKey {
  if (value && Object.prototype.hasOwnProperty.call(VERTICAL_QUERIES, value)) return value as VerticalKey;
  return "hair_salon";
}

function parseGridPoint(value: string) {
  const normalized = value.trim().replace(/^@/, "");
  const [latRaw, lngRaw, zoomRaw] = normalized.split(",");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { lat: 0, lng: 0, llParam: "" };
  }
  return { lat, lng, llParam: `@${lat},${lng},${zoomRaw ?? "13z"}` };
}

function findRawForLead(rawResults: unknown[], lead: NormalizedLead) {
  return rawResults.find((item) => {
    if (!item || typeof item !== "object") return false;
    const raw = item as SerperResult;
    const placeId = raw.placeId ?? raw.place_id ?? (raw.cid != null ? String(raw.cid) : null);
    return placeId === lead.google_place_id || raw.phoneNumber === lead.phone || raw.phone === lead.phone;
  });
}

function isConflictError(error: { code?: string; message?: string }) {
  return error.code === "23505" || /duplicate|conflict/i.test(error.message ?? "");
}
