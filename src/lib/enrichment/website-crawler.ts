import * as cheerio from "cheerio";
import type { PlatformHit } from "@/types";
import { detectPlatforms } from "@/lib/enrichment/platform-detector";
import { normalizePhone } from "@/lib/providers/serper";
import { env } from "@/lib/env";
import { logApiCall, API_COSTS } from "@/lib/api-logger";

export type CrawlResult = {
  url: string;
  status: "crawled" | "failed" | "skipped" | "blocked";
  phones: string[];
  emails: string[];
  booking_urls: string[];
  platform_hits: PlatformHit[];
  cta_strength: "strong" | "weak" | "none";
  has_online_booking: boolean;
  has_phone_visible: boolean;
  instagram_links: string[];
  facebook_links: string[];
  tiktok_links: string[];
  response_status: number | null;
  crawl_duration_ms: number;
  error?: string;
};

const PHONE_REGEX = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BOOK_ANCHOR_RE = /\b(book|booking|schedule|appointment|reserve|book now)\b/i;
const STRONG_CTA = [
  "book now",
  "book appointment",
  "schedule now",
  "book online",
  "schedule appointment",
  "make appointment",
  "reserve now",
  "book today",
  "get appointment",
];
const WEAK_CTA = ["contact us", "call us", "appointment", "booking", "schedule"];
const BOOKING_DOMAINS = [
  "square.site",
  "squareup.com/appointments",
  "book.squareup.com",
  "vagaro.com",
  "mindbodyonline.com",
  "acuityscheduling.com",
  "glossgenius.com",
  "booksy.com",
  "fresha.com",
  "boulevard.app",
  "joinblvd.com",
  "styleseat.com",
  "schedulicity.com",
];

// Regex to pull raw social URLs from HTML source (catches script blocks, JSON-LD, Wix/Squarespace embeds)
const INSTAGRAM_RAW_RE = /https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._]{1,30})\/?(?=[^a-zA-Z0-9._/]|$)/g;
const FACEBOOK_RAW_RE = /https?:\/\/(?:www\.)?(?:facebook\.com|fb\.com)\/([^\s"'`<>\\\]/?#][^\s"'`<>\\\]]*)/g;
const TIKTOK_RAW_RE = /https?:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9._]{1,30})\/?(?=[^a-zA-Z0-9._/]|$)/g;

// Instagram path segments that are NOT profile URLs
const IG_EXCLUDED = new Set(["p", "reel", "reels", "stories", "explore", "accounts", "tv", "legal", "about", "share", "direct"]);
// Facebook path segments that are NOT business profile URLs
const FB_EXCLUDED = new Set(["login", "recover", "help", "watch", "gaming", "marketplace", "reel", "reels", "sharer", "share", "dialog", "plugins"]);
// TikTok path segments that are NOT profile URLs
const TT_EXCLUDED = new Set(["share", "embed", "video", "discover", "live", "explore"]);

export async function crawlWebsite(url: string, leadId?: string): Promise<CrawlResult> {
  const start = Date.now();
  const normalized = url.startsWith("http") ? url : `https://${url}`;

  try {
    const response = await fetch(normalized, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RingBookerSalesBot/1.0; +https://ringbooker.com)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return emptyResult(normalized, response.status === 403 || response.status === 429 ? "blocked" : "failed", Date.now() - start, response.status, `HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      return emptyResult(normalized, "skipped", Date.now() - start, response.status, "Not HTML");
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const links = collectAttrs($, "a[href]", "href", normalized);
    const scriptSrcs = collectAttrs($, "script[src]", "src", normalized);
    const iframeSrcs = collectAttrs($, "iframe[src]", "src", normalized);
    const allLinks = [...links, ...iframeSrcs];
    const bodyText = $("body").text().replace(/\s+/g, " ").toLowerCase();

    // Cloudflare Browser Rendering: fetches the JS-rendered page as markdown.
    // Catches social links / phones / booking URLs that Wix/Squarespace/Showit
    // inject via JavaScript and are absent from the raw HTML above. Best-effort.
    const markdown = await fetchMarkdownViaCloudflare(normalized, leadId);

    const platform_hits = detectPlatforms(html, allLinks, scriptSrcs);
    const booking_urls = mergeUnique(
      extractBookingUrls($, allLinks),
      markdown ? extractBookingFromText(markdown) : [],
    ).slice(0, 5);
    const { instagram_links, facebook_links, tiktok_links } = extractSocialLinks(html, allLinks, markdown);
    const phones = mergeUnique(
      extractPhones(html),
      markdown ? extractPhones(markdown) : [],
    ).slice(0, 5);
    const emails = extractEmails(html);
    const cta_strength = detectCtaStrength(markdown ? `${bodyText} ${markdown.toLowerCase()}` : bodyText);

    return {
      url: normalized,
      status: "crawled",
      phones,
      emails,
      booking_urls,
      platform_hits,
      cta_strength,
      has_online_booking: booking_urls.length > 0 || platform_hits.length > 0,
      has_phone_visible: phones.length > 0,
      instagram_links,
      facebook_links,
      tiktok_links,
      response_status: response.status,
      crawl_duration_ms: Date.now() - start,
    };
  } catch (error) {
    return emptyResult(normalized, "failed", Date.now() - start, null, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Render a page via Cloudflare Browser Rendering and return its Markdown.
 * Best-effort: returns null if credentials are absent or the call fails.
 */
async function fetchMarkdownViaCloudflare(url: string, leadId?: string): Promise<string | null> {
  if (!env.cloudflareAccountId || !env.cloudflareBrowserToken) return null;

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.cloudflareAccountId}/browser-rendering/markdown`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.cloudflareBrowserToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(25_000),
      },
    );

    logApiCall({
      provider: "cloudflare",
      endpoint: "browser_rendering_markdown",
      estimatedCostUsd: response.ok ? API_COSTS.cloudflare_markdown : 0,
      status: response.ok ? "success" : "error",
      leadId,
      metadata: { url, httpStatus: response.status },
    });

    if (!response.ok) return null;
    const json = (await response.json()) as { success?: boolean; result?: unknown };
    return json.success && typeof json.result === "string" ? json.result : null;
  } catch {
    return null;
  }
}

function mergeUnique(...lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}

/** Find booking-platform URLs in plain text / markdown. */
function extractBookingFromText(text: string): string[] {
  const urls = new Set<string>();
  const urlRe = /https?:\/\/[^\s)"'<>\]]+/g;
  for (const match of text.matchAll(urlRe)) {
    const lower = match[0].toLowerCase();
    if (BOOKING_DOMAINS.some((domain) => lower.includes(domain))) urls.add(match[0]);
  }
  return [...urls];
}

function emptyResult(url: string, status: CrawlResult["status"], durationMs: number, responseStatus: number | null, error: string): CrawlResult {
  return {
    url,
    status,
    phones: [],
    emails: [],
    booking_urls: [],
    platform_hits: [],
    cta_strength: "none",
    has_online_booking: false,
    has_phone_visible: false,
    instagram_links: [],
    facebook_links: [],
    tiktok_links: [],
    response_status: responseStatus,
    crawl_duration_ms: durationMs,
    error,
  };
}

function collectAttrs($: cheerio.CheerioAPI, selector: string, attr: string, baseUrl: string) {
  const values: string[] = [];
  $(selector).each((_, el) => {
    const raw = ($(el).attr(attr) ?? "").trim();
    if (!raw) return;
    try {
      values.push(new URL(raw, baseUrl).toString());
    } catch {
      values.push(raw);
    }
  });
  return [...new Set(values)];
}

function extractBookingUrls($: cheerio.CheerioAPI, links: string[]) {
  const urls = new Set<string>();
  for (const link of links) {
    const lower = link.toLowerCase();
    if (BOOKING_DOMAINS.some((domain) => lower.includes(domain))) urls.add(link);
  }
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    const text = $(el).text().trim();
    if (href.startsWith("http") && BOOK_ANCHOR_RE.test(text) && href.length < 500) urls.add(href);
  });
  return [...urls].slice(0, 5);
}

/**
 * Extract social profile links using 3 strategies:
 * 1. JSON-LD sameAs — most reliable, used by Wix/Squarespace/modern sites
 * 2. <a href> anchor tags — standard HTML links
 * 3. Raw HTML regex — catches social URLs embedded in <script> blocks, Wix config, etc.
 */
function extractSocialLinks(html: string, anchorLinks: string[], markdown?: string | null): { instagram_links: string[]; facebook_links: string[]; tiktok_links: string[] } {
  const candidatesIg = new Set<string>();
  const candidatesFb = new Set<string>();
  const candidatesTt = new Set<string>();

  // Strategy 1: JSON-LD sameAs
  for (const url of extractJsonLdSameAs(html)) {
    if (url.includes("instagram.com")) candidatesIg.add(url);
    if (url.includes("facebook.com") || url.includes("fb.com")) candidatesFb.add(url);
    if (url.includes("tiktok.com")) candidatesTt.add(url);
  }

  // Strategy 2: <a href> anchor tags (already parsed)
  for (const link of anchorLinks) {
    if (link.includes("instagram.com")) candidatesIg.add(link);
    if (link.includes("facebook.com") || link.includes("fb.com")) candidatesFb.add(link);
    if (link.includes("tiktok.com")) candidatesTt.add(link);
  }

  // Strategy 3 + 4: Raw HTML scan, plus Cloudflare-rendered markdown if available.
  // Markdown catches JS-injected social links missing from the static HTML.
  for (const source of [html, markdown ?? ""]) {
    if (!source) continue;
    for (const match of source.matchAll(INSTAGRAM_RAW_RE)) {
      candidatesIg.add(match[0]!);
    }
    for (const match of source.matchAll(FACEBOOK_RAW_RE)) {
      candidatesFb.add(`https://www.facebook.com/${match[1]!.split(/[?#]/)[0]}`);
    }
    for (const match of source.matchAll(TIKTOK_RAW_RE)) {
      candidatesTt.add(`https://www.tiktok.com/@${match[1]!}`);
    }
  }

  return {
    instagram_links: [...candidatesIg]
      .map(normalizeInstagramProfile)
      .filter((u): u is string => u !== null)
      .filter((u, i, a) => a.indexOf(u) === i)
      .slice(0, 3),
    facebook_links: [...candidatesFb]
      .map(normalizeFacebookProfile)
      .filter((u): u is string => u !== null)
      .filter((u, i, a) => a.indexOf(u) === i)
      .slice(0, 3),
    tiktok_links: [...candidatesTt]
      .map(normalizeTikTokProfile)
      .filter((u): u is string => u !== null)
      .filter((u, i, a) => a.indexOf(u) === i)
      .slice(0, 3),
  };
}

function extractJsonLdSameAs(html: string): string[] {
  const urls: string[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]!) as Record<string, unknown>;
      const candidates: unknown[] = [];
      // Top-level sameAs
      if (data.sameAs) candidates.push(...(Array.isArray(data.sameAs) ? data.sameAs : [data.sameAs]));
      // @graph nested
      if (Array.isArray(data["@graph"])) {
        for (const node of data["@graph"] as Record<string, unknown>[]) {
          if (node.sameAs) candidates.push(...(Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs]));
        }
      }
      for (const u of candidates) {
        if (typeof u === "string" && u.startsWith("http")) urls.push(u);
      }
    } catch {
      // malformed JSON-LD — ignore
    }
  }
  return urls;
}

function normalizeInstagramProfile(url: string): string | null {
  try {
    const u = new URL(url);
    const segs = u.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (segs.length !== 1) return null;
    const handle = segs[0]!.toLowerCase();
    if (IG_EXCLUDED.has(handle)) return null;
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) return null;
    return `https://www.instagram.com/${handle}`;
  } catch {
    return null;
  }
}

function normalizeTikTokProfile(url: string): string | null {
  try {
    const u = new URL(url);
    const segs = u.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (segs.length === 0) return null;
    const first = segs[0]!;
    // TikTok profiles always start with @
    if (!first.startsWith("@")) return null;
    const handle = first.slice(1).toLowerCase();
    if (!handle || TT_EXCLUDED.has(handle)) return null;
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) return null;
    return `https://www.tiktok.com/@${handle}`;
  } catch {
    return null;
  }
}

function normalizeFacebookProfile(url: string): string | null {
  try {
    const u = new URL(url);
    const pathLower = u.pathname.toLowerCase();
    // Reject share/dialog/plugin paths
    if (
      pathLower.includes("/sharer") ||
      pathLower.includes("share.php") ||
      pathLower.includes("/dialog/") ||
      pathLower.includes("/plugins/") ||
      pathLower.includes("/login") ||
      pathLower.startsWith("/events/") ||
      pathLower.startsWith("/groups/")
    ) return null;
    const segs = u.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (segs.length === 0) return null;
    if (FB_EXCLUDED.has(segs[0]!.toLowerCase())) return null;
    // Normalize: strip query/hash, trailing slash
    const normalized = `https://www.facebook.com/${segs.join("/")}`;
    return normalized;
  } catch {
    return null;
  }
}

function extractPhones(html: string) {
  const phones = new Set<string>();
  for (const match of html.matchAll(PHONE_REGEX)) {
    const normalized = normalizePhone(match[0]);
    if (normalized) phones.add(normalized);
  }
  return [...phones].slice(0, 5);
}

function extractEmails(html: string) {
  const emails = new Set<string>();
  for (const match of html.matchAll(EMAIL_REGEX)) {
    const value = match[0].toLowerCase();
    if (!value.includes("example.com") && !value.includes("test.com")) emails.add(value);
  }
  return [...emails].slice(0, 3);
}

export function extractInstagramHandle(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/^\//, "").replace(/\/$/, "");
    const handle = path.split("/")[0];
    if (handle && /^[a-zA-Z0-9._]{1,30}$/.test(handle)) return handle;
    return null;
  } catch {
    return null;
  }
}

function detectCtaStrength(text: string): "strong" | "weak" | "none" {
  if (STRONG_CTA.some((cta) => text.includes(cta))) return "strong";
  if (WEAK_CTA.some((cta) => text.includes(cta))) return "weak";
  return "none";
}
