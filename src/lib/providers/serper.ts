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
  location: string;
  country?: string;
  limit?: number;
  lat?: number;
  lng?: number;
};

export type SerperSearchResult = {
  results: NormalizedLead[];
  totalFound: number;
  estimatedCostUsd: number;
  rawResults: SerperResult[];
};

function clampRequestedResults(limit: number) {
  return Math.min(Math.max(Math.floor(limit || 1), 1), SERPER_MAPS_MAX_RESULTS);
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

  const requestedResults = clampRequestedResults(options.limit ?? 50);
  const maxPages = Math.ceil(requestedResults / SERPER_MAPS_PAGE_SIZE);
  const results: NormalizedLead[] = [];
  const rawResults: SerperResult[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages && results.length < requestedResults; page += 1) {
    const pageSize = Math.min(SERPER_MAPS_PAGE_SIZE, requestedResults - results.length);
    const body: Record<string, unknown> = {
      q: `${options.query.trim()} ${options.location.trim()}`.trim(),
      gl: options.country ?? "us",
      hl: "en",
      num: pageSize,
      page,
    };

    if (options.lat != null && options.lng != null) {
      body.ll = `@${options.lat.toFixed(7)},${options.lng.toFixed(7)},14z`;
    } else if (page > 1) {
      break;
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
    if (places.length === 0) break;

    let uniqueAdded = 0;
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
      uniqueAdded += 1;
      if (results.length >= requestedResults) break;
    }

    if (uniqueAdded === 0) break;
  }

  return {
    results,
    totalFound: results.length,
    estimatedCostUsd: Math.ceil(requestedResults / SERPER_MAPS_PAGE_SIZE) * 0.001,
    rawResults,
  };
}

function normalizeSerperResult(raw: SerperResult): NormalizedLead | null {
  if (!raw.title.trim()) return null;
  const { city, state } = parseAddress(raw.address ?? "");
  const lat = typeof raw.latitude === "number" ? raw.latitude : raw.latitude ? Number.parseFloat(raw.latitude) : null;
  const lng = typeof raw.longitude === "number" ? raw.longitude : raw.longitude ? Number.parseFloat(raw.longitude) : null;
  const placeId = raw.placeId ?? (raw.cid != null ? String(raw.cid) : null);
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
      : raw.placeId
        ? `https://www.google.com/maps/place/?q=place_id:${raw.placeId}`
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
