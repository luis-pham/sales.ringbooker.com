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
  ...BOOKING_PLATFORM_DOMAINS,
];

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

  const q = city.trim() ? `"${salonName.trim()}" "${city.trim()}"` : `"${salonName.trim()}"`;

  let organic: SerperOrganic[] = [];
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

    // The salon's own website = first organic result that isn't a known directory/social/booking
    if (!result.website && !NON_WEBSITE_DOMAINS.some((d) => host.includes(d))) {
      result.website = `https://${host}`;
    }
  }

  result.bookingUrls = [...bookingSet].slice(0, 5);
  return result;
}
