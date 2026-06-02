import * as cheerio from "cheerio";
import type { PlatformHit } from "@/types";
import { detectPlatforms } from "@/lib/enrichment/platform-detector";
import { normalizePhone } from "@/lib/providers/serper";

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

export async function crawlWebsite(url: string): Promise<CrawlResult> {
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
    const platform_hits = detectPlatforms(html, allLinks, scriptSrcs);
    const booking_urls = extractBookingUrls($, allLinks);
    const instagram_links = extractInstagramLinks(allLinks);
    const phones = extractPhones(html);
    const emails = extractEmails(html);
    const cta_strength = detectCtaStrength(bodyText);

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
      response_status: response.status,
      crawl_duration_ms: Date.now() - start,
    };
  } catch (error) {
    return emptyResult(normalized, "failed", Date.now() - start, null, error instanceof Error ? error.message : String(error));
  }
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

export function extractInstagramLinks(links: string[]) {
  return links
    .filter((link) => link.includes("instagram.com/"))
    .map((link) => link.split("?")[0]?.replace(/\/$/, "") ?? link)
    .filter((link, index, all) => all.indexOf(link) === index)
    .slice(0, 3);
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
