import { env } from "@/lib/env";
import { logApiCall, API_COSTS } from "@/lib/api-logger";
import {
  normalizeFacebookProfile,
  normalizeInstagramProfile,
  normalizeTikTokProfile,
} from "@/lib/enrichment/website-crawler";

// Booking platforms — these are signals, not the salon's own website
const BOOKING_PLATFORM_DOMAINS = [
  "styleseat.com",
  "vagaro.com",
  "booksy.com",
  "fresha.com",
  "genbook.com",
  "squareup.com",
  "square.site",
  "acuityscheduling.com",
  "glossgenius.com",
  "schedulicity.com",
  "mindbodyonline.com",
  "boulevard.app",
  "joinblvd.com",
];

// Generic words that don't identify a specific salon — excluded when building the
// name tokens used to verify a harvested link actually belongs to this business.
const GENERIC_NAME_TOKENS = new Set([
  "salon", "salons", "nail", "nails", "hair", "spa", "spas", "studio", "studios",
  "beauty", "lash", "lashes", "brow", "brows", "med", "medical", "day", "the",
  "and", "barber", "barbershop", "wax", "waxing", "skin", "skincare", "tattoo",
  "co", "llc", "inc", "shop", "bar", "lounge", "boutique",
]);

/** Distinctive tokens from a salon name (drops generic vertical words). */
function salonNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !GENERIC_NAME_TOKENS.has(t));
}

/** Salon name compacted to [a-z0-9] for handle/path comparison. */
function compactName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** First path segment of a social URL, compacted to [a-z0-9] (the account handle). */
function profileHandle(url: string): string {
  try {
    const seg = new URL(url).pathname.replace(/^\/+|\/+$/g, "").split("/")[0] ?? "";
    return seg.replace(/[^a-z0-9]/gi, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * A social result belongs to the salon when its TITLE carries a distinctive name
 * token AND the CITY (in the title, or embedded in the handle — e.g. @soroleaguecity).
 * The city is the disambiguator that separates same-name salons in other towns
 * (e.g. "Southern Roots & Co." in Grand Saline). Title is the right signal because
 * real handles are often abbreviations (soroleaguecity) that no name-token check
 * would accept — while news/listicles ("Community Impact") lack the salon name.
 */
function socialMatchesSalon(title: string | undefined, profileUrl: string | null, tokens: string[], compact: string, city: string): boolean {
  const t = (title ?? "").toLowerCase();
  if (!tokens.some((tok) => t.includes(tok))) return false; // salon name must be in the result title
  const handle = profileUrl ? profileHandle(profileUrl) : "";
  // Strong signal: the handle embeds the full business name (e.g. @shadesnailtx,
  // @southernrootsboutiqueandsalon) — accept even without a city in the title.
  if (compact.length >= 8 && handle.includes(compact)) return true;
  // Otherwise the city disambiguates same-name salons in other towns.
  const c = city.trim().toLowerCase();
  if (!c) return true;
  if (t.includes(c)) return true;
  return handle.includes(c.replace(/[^a-z0-9]/g, "")); // city embedded in the handle (e.g. @soroleaguecity)
}

/** True when a URL's path carries the salon name (used for Yelp /biz slugs and
 *  booking-platform business pages, e.g. vagaro.com/southernrootssalon). */
function urlPathMatchesSalon(url: string, tokens: string[], compact: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (compact.length >= 4 && path.includes(compact)) return true;
    return tokens.some((t) => t.length >= 4 && path.includes(t));
  } catch {
    return false;
  }
}

export type DiscoveredChannels = {
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  yelp: string | null;
  bookingUrls: string[];
};

type SerperOrganic = { title?: string; link?: string; snippet?: string };

/** One Serper web search → organic results (empty on any error). */
async function serperOrganic(q: string, leadId?: string): Promise<SerperOrganic[]> {
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": env.serperApiKey! },
      body: JSON.stringify({ q, gl: "us", hl: "en", num: 10 }),
      signal: AbortSignal.timeout(20_000),
    });
    logApiCall({
      provider: "serper",
      endpoint: "web_search",
      estimatedCostUsd: response.ok ? API_COSTS.serper_web_search : 0,
      status: response.ok ? "success" : "error",
      leadId,
      metadata: { q },
    });
    if (!response.ok) return [];
    const json = (await response.json()) as { organic?: SerperOrganic[] };
    return Array.isArray(json.organic) ? json.organic : [];
  } catch {
    return [];
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * When Google Maps returns no socials for a high-quality salon, run a Serper *web*
 * search ("Name" "City") and harvest the salon's SOCIAL channels (Instagram,
 * Facebook, TikTok, Yelp, booking) — verified per-channel against the account
 * handle / URL path. Never guesses a website: Maps is the only website source, so a
 * news/directory result can't be mistaken for the salon's site.
 */
export async function searchWebForChannels(
  salonName: string,
  city: string,
  leadId?: string,
): Promise<DiscoveredChannels> {
  const empty: DiscoveredChannels = {
    instagram: null, facebook: null, tiktok: null, yelp: null, bookingUrls: [],
  };
  if (!env.serperApiKey || !salonName.trim()) return empty;

  // Ownership guard: without distinctive name tokens we can't verify a result
  // belongs to this salon — skip the search entirely to avoid mis-attribution.
  const tokens = salonNameTokens(salonName);
  if (tokens.length === 0) return empty;
  const compact = compactName(salonName);

  // Two complementary queries (deduped), because no single phrasing surfaces every
  // salon's profiles:
  //   • full exact name + city → catches profiles whose handle = full name (@shadesnailtx)
  //   • partial name (first ≤2 tokens) + city → catches profiles whose display name
  //     differs slightly (e.g. "Southern Roots Salon" → @soroleaguecity)
  // The per-channel title/handle + city filter below keeps only the salon's own accounts.
  const fullPhrase = salonName.trim();
  const namePhrase = tokens.slice(0, 2).join(" ");
  const cityQ = city.trim();
  const queries = [cityQ ? `"${fullPhrase}" "${cityQ}"` : `"${fullPhrase}"`];
  if (namePhrase && namePhrase.toLowerCase() !== fullPhrase.toLowerCase()) {
    queries.push(cityQ ? `"${namePhrase}" "${cityQ}"` : `"${namePhrase}"`);
  }

  const result: DiscoveredChannels = { ...empty };
  const bookingSet = new Set<string>();
  const seenLinks = new Set<string>();

  // Run queries sequentially and stop once both key channels (IG + FB) are found —
  // the second query is only paid for when the first didn't fully resolve them.
  for (const q of queries) {
    if (result.instagram && result.facebook) break;

    for (const item of await serperOrganic(q, leadId)) {
      const link = item.link?.trim();
      if (!link?.startsWith("http")) continue;
      if (seenLinks.has(link)) continue;
      seenLinks.add(link);
      const host = hostOf(link);
      if (!host) continue;

      // Social channels — accept only when the result title matches the salon + city.
      if (!result.instagram && host.includes("instagram.com")) {
        const profile = normalizeInstagramProfile(link);
        if (socialMatchesSalon(item.title, profile, tokens, compact, city)) result.instagram = profile;
      } else if (!result.facebook && (host.includes("facebook.com") || host === "fb.com")) {
        const profile = normalizeFacebookProfile(link);
        if (socialMatchesSalon(item.title, profile, tokens, compact, city)) result.facebook = profile;
      } else if (!result.tiktok && host.includes("tiktok.com")) {
        const profile = normalizeTikTokProfile(link);
        if (socialMatchesSalon(item.title, profile, tokens, compact, city)) result.tiktok = profile;
      } else if (!result.yelp && host.includes("yelp.com") && link.includes("/biz/")) {
        if (urlPathMatchesSalon(link, tokens, compact)) result.yelp = link.split("?")[0]!;
      }

      // Booking platforms — only the salon's own business page (slug carries the name).
      if (BOOKING_PLATFORM_DOMAINS.some((d) => host.includes(d)) && urlPathMatchesSalon(link, tokens, compact)) {
        bookingSet.add(link.split("?")[0]!);
      }
    }
  }

  result.bookingUrls = [...bookingSet].slice(0, 5);
  return result;
}
