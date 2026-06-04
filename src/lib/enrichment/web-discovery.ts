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

// Directories / aggregators / socials — never the salon's own website
const NON_WEBSITE_DOMAINS = [
  "facebook.com", "instagram.com", "tiktok.com", "twitter.com", "x.com",
  "yelp.com", "google.com", "goo.gl", "youtube.com", "youtu.be", "linkedin.com",
  "pinterest.com", "tripadvisor.com", "yellowpages.com", "mapquest.com",
  "foursquare.com", "nextdoor.com", "groupon.com", "thumbtack.com", "angi.com",
  "bbb.org", "manta.com", "chamberofcommerce.com", "loc8nearme.com",
  "booking.com", "wellness.com", "spafinder.com", "expertise.com", "birdeye.com",
  // Salon/places discovery apps that rank for any salon query and whose own brand
  // socials get mis-attributed (e.g. atly.com → @atly / @atlyofficial).
  "atly.com", "salonfinder.com",
  // Local-news / directory media that publish articles ABOUT salons — their article
  // titles contain the salon name (so they pass a title match) but the site/socials
  // belong to the publisher, not the salon (e.g. communityimpact.com → @communityimpactnews).
  "communityimpact.com", "patch.com", "yahoo.com", "msn.com", "medium.com",
  ...BOOKING_PLATFORM_DOMAINS,
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

/** True when an organic result plausibly belongs to this salon (title or host
 *  contains a distinctive name token). Prevents harvesting a directory's or a
 *  different business's website/socials. */
function resultMatchesSalon(title: string | undefined, host: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const hay = `${title ?? ""} ${host}`.toLowerCase();
  return tokens.some((t) => hay.includes(t));
}

export type DiscoveredChannels = {
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  yelp: string | null;
  bookingUrls: string[];
};

type SerperOrganic = { title?: string; link?: string; snippet?: string };

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Registrable domain (eTLD+1 approximation) — strips subdomains so a directory that
 *  mints per-business subdomains (e.g. southern-roots-salon.wheree.com) is judged by
 *  its real domain "wheree.com", not the salon-named subdomain. */
function registrableDomain(host: string): string {
  const parts = host.split(".");
  return parts.length <= 2 ? host : parts.slice(-2).join(".");
}

/**
 * When Google Maps returns no website/socials for a high-quality salon, run a
 * Serper *web* search ("Name" "City") and harvest the salon's channels from the
 * organic results: website, Instagram, Facebook, TikTok, Yelp, booking platforms.
 */
export async function searchWebForChannels(
  salonName: string,
  city: string,
  leadId?: string,
): Promise<DiscoveredChannels> {
  const empty: DiscoveredChannels = {
    website: null, instagram: null, facebook: null, tiktok: null, yelp: null, bookingUrls: [],
  };
  if (!env.serperApiKey || !salonName.trim()) return empty;

  // Ownership guard: without distinctive name tokens we can't tell a real result
  // from a directory (e.g. atly.com) — skip the search entirely to avoid mis-attribution.
  const tokens = salonNameTokens(salonName);
  if (tokens.length === 0) return empty;

  const q = city.trim() ? `"${salonName.trim()}" "${city.trim()}"` : `"${salonName.trim()}"`;

  let organic: SerperOrganic[];
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": env.serperApiKey },
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

    if (!response.ok) return empty;
    const json = (await response.json()) as { organic?: SerperOrganic[] };
    organic = Array.isArray(json.organic) ? json.organic : [];
  } catch {
    return empty;
  }

  const result: DiscoveredChannels = { ...empty };
  const bookingSet = new Set<string>();

  for (const item of organic) {
    const link = item.link?.trim();
    if (!link?.startsWith("http")) continue;
    const host = hostOf(link);
    if (!host) continue;

    // Only harvest from results that plausibly belong to THIS salon (title/host
    // shares a distinctive name token). This is what stops "@atly" being saved
    // for "Shades Nail".
    if (!resultMatchesSalon(item.title, host, tokens)) continue;

    // Social channels
    if (!result.instagram && host.includes("instagram.com")) {
      result.instagram = normalizeInstagramProfile(link);
    } else if (!result.facebook && (host.includes("facebook.com") || host === "fb.com")) {
      result.facebook = normalizeFacebookProfile(link);
    } else if (!result.tiktok && host.includes("tiktok.com")) {
      result.tiktok = normalizeTikTokProfile(link);
    } else if (!result.yelp && host.includes("yelp.com") && link.includes("/biz/")) {
      result.yelp = link.split("?")[0]!;
    }

    // Booking platforms
    if (BOOKING_PLATFORM_DOMAINS.some((d) => host.includes(d))) {
      bookingSet.add(link.split("?")[0]!);
    }

    // The salon's own website = first result whose HOST itself carries a distinctive
    // salon-name token. A matching *title* isn't enough — news/directory articles
    // about the salon (e.g. communityimpact.com) have a matching title but the domain
    // belongs to the publisher. Better to leave website null than attribute a wrong one.
    if (
      !result.website &&
      !NON_WEBSITE_DOMAINS.some((d) => host.includes(d)) &&
      tokens.some((t) => registrableDomain(host).includes(t))
    ) {
      result.website = `https://${host}`;
    }
  }

  result.bookingUrls = [...bookingSet].slice(0, 5);
  return result;
}
