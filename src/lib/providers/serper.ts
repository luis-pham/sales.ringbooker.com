import { z } from "zod";
import { env } from "@/lib/env";

const SERPER_MAPS_PAGE_SIZE = 20;
const SERPER_MAPS_MAX_RESULTS = 100;

const SerperResultSchema = z.object({
  title: z.string(),
  address: z.string().optional(),
  latitude: z.union([z.number(), z.string()]).optional(),
  longitude: z.union([z.number(), z.string()]).optional(),
  rating: z.number().optional(),
  ratingCount: z.number().optional(),
  reviews: z.number().optional(),
  category: z.string().optional(),
  types: z.array(z.string()).optional(),
  phone: z.string().optional(),
  phoneNumber: z.string().optional(),
  website: z.string().optional(),
  link: z.string().optional(),
  cid: z.union([z.string(), z.number()]).optional(),
  placeId: z.string().optional(),
  place_id: z.string().optional(),
});

export type SerperResult = z.infer<typeof SerperResultSchema>;

export type NormalizedLead = {
  name: string;
  phone: string | null;
  website_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  google_maps_url: string | null;
  rating: number | null;
  review_count: number | null;
  categories: string[];
  hours_raw: Record<string, unknown> | null;
};

export type SerperSearchOptions = {
  query: string;
  location?: string;
  country?: string;
  limit?: number;
  lat?: number;
  lng?: number;
  llParam?: string;
  page?: number;
  num?: number;
};

export type SerperSearchResult = {
  results: NormalizedLead[];
  hasMore: boolean;
  totalFound: number;
  page: number;
  estimatedCostUsd: number;
  rawResults: SerperResult[];
};

function clampRequestedResults(limit: number) {
  return Math.min(Math.max(Math.floor(limit || 1), 1), SERPER_MAPS_MAX_RESULTS);
}

function clampPageSize(num: number) {
  return Math.min(Math.max(Math.floor(num || SERPER_MAPS_PAGE_SIZE), 1), SERPER_MAPS_MAX_RESULTS);
}

function dedupeKey(result: NormalizedLead) {
  if (result.google_place_id) return `place:${result.google_place_id}`;
  const phoneDigits = result.phone?.replace(/\D/g, "");
  if (phoneDigits && phoneDigits.length >= 7) return `phone:${phoneDigits}`;
  if (result.website_url) return `website:${result.website_url.toLowerCase().replace(/\/+$/, "")}`;
  return `name-address:${result.name.toLowerCase()}|${(result.address ?? "").toLowerCase()}`;
}

export async function searchGoogleMaps(options: SerperSearchOptions): Promise<SerperSearchResult> {
  if (!env.serperApiKey) throw new Error("SERPER_API_KEY missing");

  if (options.page != null || options.num != null || options.llParam) {
    return searchGoogleMapsPage(options);
  }

  const requestedResults = clampRequestedResults(options.limit ?? 50);
  const maxPages = Math.ceil(requestedResults / SERPER_MAPS_PAGE_SIZE);
  const results: NormalizedLead[] = [];
  const rawResults: SerperResult[] = [];
  const seen = new Set<string>();
  let cost = 0;
  let lastPage = 1;
  let hasMore = false;
  // Serper requires ll (GPS) for page > 1. Derive from first result if not supplied.
  let llParam = options.llParam;

  for (let page = 1; page <= maxPages && results.length < requestedResults; page += 1) {
    // Cannot paginate without GPS coordinates — stop before hitting the 400 error
    if (page > 1 && !llParam && options.lat == null && options.lng == null) break;

    const pageSize = Math.min(SERPER_MAPS_PAGE_SIZE, requestedResults - results.length);
    const response = await searchGoogleMapsPage({ ...options, page, num: pageSize, llParam });
    cost += response.estimatedCostUsd;
    lastPage = page;
    hasMore = response.hasMore;
    rawResults.push(...response.rawResults);

    // After page 1, derive ll from the first result with valid coordinates
    if (page === 1 && !llParam && options.lat == null && options.lng == null) {
      const firstWithCoords = response.results.find((r) => r.lat != null && r.lng != null);
      if (firstWithCoords?.lat != null && firstWithCoords?.lng != null) {
        llParam = `@${firstWithCoords.lat.toFixed(7)},${firstWithCoords.lng.toFixed(7)},14z`;
      }
    }

    let uniqueAdded = 0;
    for (const lead of response.results) {
      const key = dedupeKey(lead);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(lead);
      uniqueAdded += 1;
      if (results.length >= requestedResults) break;
    }

    if (!response.hasMore || uniqueAdded === 0) break;
  }

  return {
    results,
    hasMore,
    totalFound: results.length,
    page: lastPage,
    estimatedCostUsd: cost,
    rawResults,
  };
}

async function searchGoogleMapsPage(options: SerperSearchOptions): Promise<SerperSearchResult> {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const pageSize = clampPageSize(options.num ?? options.limit ?? SERPER_MAPS_PAGE_SIZE);
  const q = `${options.query.trim()} ${options.location?.trim() ?? ""}`.trim();
  const body: Record<string, unknown> = {
    q,
    gl: options.country ?? "us",
    hl: "en",
    num: pageSize,
    page,
  };

  if (options.llParam) {
    body.ll = options.llParam;
  } else if (options.lat != null && options.lng != null) {
    body.ll = `@${options.lat.toFixed(7)},${options.lng.toFixed(7)},14z`;
  }

  const response = await fetch("https://google.serper.dev/maps", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": env.serperApiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });

  if (response.status === 401 || response.status === 403) throw new Error("Serper auth failed");
  if (response.status === 429) throw new Error("Serper rate limited");
  if (!response.ok) throw new Error(`Serper error ${response.status}: ${(await response.text()).slice(0, 200)}`);

  const json = (await response.json()) as { places?: unknown[] };
  const places = Array.isArray(json.places) ? json.places : [];
  const rawResults: SerperResult[] = [];
  const results: NormalizedLead[] = [];
  const seen = new Set<string>();

  for (const place of places) {
    const parsed = SerperResultSchema.safeParse(place);
    if (!parsed.success) continue;
    rawResults.push(parsed.data);
    const mapped = normalizeSerperResult(parsed.data);
    if (!mapped) continue;
    const key = dedupeKey(mapped);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(mapped);
  }

  return {
    results,
    hasMore: places.length >= pageSize,
    totalFound: results.length,
    page,
    estimatedCostUsd: 0.001,
    rawResults,
  };
}

function normalizeSerperResult(raw: SerperResult): NormalizedLead | null {
  if (!raw.title.trim()) return null;
  const { city, state } = parseAddress(raw.address ?? "");
  const lat = typeof raw.latitude === "number" ? raw.latitude : raw.latitude ? Number.parseFloat(raw.latitude) : null;
  const lng = typeof raw.longitude === "number" ? raw.longitude : raw.longitude ? Number.parseFloat(raw.longitude) : null;
  const placeId = raw.placeId ?? raw.place_id ?? (raw.cid != null ? String(raw.cid) : null);
  const website = raw.website ?? raw.link ?? null;

  return {
    name: raw.title.trim(),
    phone: normalizePhone(raw.phoneNumber ?? raw.phone ?? null),
    website_url: normalizeUrl(website),
    address: raw.address ?? null,
    city: city || null,
    state: state || null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    google_place_id: placeId,
    google_maps_url: raw.cid
      ? `https://www.google.com/maps?cid=${raw.cid}`
      : placeId
        ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
        : raw.link ?? null,
    rating: raw.rating ?? null,
    review_count: raw.ratingCount ?? raw.reviews ?? null,
    categories: raw.types ?? (raw.category ? [raw.category] : []),
    hours_raw: null,
  };
}

function parseAddress(address: string): { city: string; state: string } {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const stateZipPart = parts.find((part) => /^[A-Z]{2}\s+\d{5}/.test(part));
  if (stateZipPart) {
    const [state] = stateZipPart.split(" ");
    const cityIndex = parts.indexOf(stateZipPart) - 1;
    return { city: cityIndex >= 0 ? parts[cityIndex] ?? "" : "", state: state ?? "" };
  }
  const filtered = parts.filter((part) => !["USA", "United States"].includes(part));
  return {
    city: filtered[filtered.length - 2] ?? "",
    state: filtered[filtered.length - 1]?.slice(0, 2) ?? "",
  };
}

export function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function normalizeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (parsed.hostname.includes("google.") || parsed.hostname.includes("maps.")) return null;
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}
