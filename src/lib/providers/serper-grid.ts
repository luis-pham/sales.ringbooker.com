import { SERPER_MAX_PAGES, VERTICAL_QUERIES, type VerticalKey } from "@/lib/config/search-targets";
import { type NormalizedLead, searchGoogleMaps } from "@/lib/providers/serper";

export type GridSearchOptions = {
  vertical: VerticalKey;
  city: string;
  state: string;
  gridPoint: { lat: number; lng: number; llParam: string };
  gridIndex: number;
  gridTotal: number;
  queryVariation: string;
  queryVariationIndex: number;
};

export type GridSearchResult = {
  leads: NormalizedLead[];
  totalFetched: number;
  totalAfterDedup: number;
  pagesSearched: number;
  estimatedCostUsd: number;
  gridPoint: string;
  rawResults: unknown[];
};

export async function searchGridPoint(options: GridSearchOptions): Promise<GridSearchResult> {
  const allLeads: NormalizedLead[] = [];
  const rawResults: unknown[] = [];
  let page = 1;
  let hasMore = true;
  let totalCost = 0;

  while (hasMore && page <= SERPER_MAX_PAGES) {
    const response = await searchGoogleMaps({
      query: options.queryVariation || VERTICAL_QUERIES[options.vertical][0],
      location: options.gridPoint.llParam ? undefined : `${options.city}, ${options.state}`,
      llParam: options.gridPoint.llParam || undefined,
      country: "us",
      page,
      num: 20,
    });

    if (response.results.length === 0) break;

    allLeads.push(...response.results);
    rawResults.push(...response.rawResults);
    totalCost += response.estimatedCostUsd;
    hasMore = response.hasMore;
    page += 1;

    if (hasMore && page <= SERPER_MAX_PAGES) await sleep(500);
  }

  const deduped = deduplicateInMemory(allLeads);

  return {
    leads: deduped,
    totalFetched: allLeads.length,
    totalAfterDedup: deduped.length,
    pagesSearched: page - 1,
    estimatedCostUsd: totalCost,
    gridPoint: options.gridPoint.llParam || `${options.city},${options.state}`,
    rawResults,
  };
}

export function deduplicateInMemory(leads: NormalizedLead[]): NormalizedLead[] {
  const seenPlaceIds = new Set<string>();
  const seenPhones = new Set<string>();
  const seenNameAddress = new Set<string>();
  const result: NormalizedLead[] = [];

  for (const lead of leads) {
    if (lead.google_place_id) {
      if (seenPlaceIds.has(lead.google_place_id)) continue;
      seenPlaceIds.add(lead.google_place_id);
    }

    if (!lead.google_place_id && lead.phone) {
      if (seenPhones.has(lead.phone)) continue;
      seenPhones.add(lead.phone);
    }

    if (!lead.google_place_id && !lead.phone) {
      const key = `${lead.name.toLowerCase()}|${(lead.address ?? "").toLowerCase()}`;
      if (seenNameAddress.has(key)) continue;
      seenNameAddress.add(key);
    }

    result.push(lead);
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
