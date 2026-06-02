import { env } from "@/lib/env";
import { detectPlatformFromUrl } from "@/lib/enrichment/platform-detector";
import { logApiCall, API_COSTS } from "@/lib/api-logger";

const APIFY_BASE = "https://api.apify.com/v2";
const INSTAGRAM_SCRAPER_ACTOR = "apify~instagram-profile-scraper";

export type InstagramProfile = {
  handle: string;
  profileUrl: string;
  followers: number | null;
  bio: string | null;
  bioLinks: string[];
  lastPostAt: Date | null;
  postCount30d: number;
  activeLast30Days: boolean;
  bookingLinkInBio: boolean;
  detectedPlatform: string | null;
  platformConfidence: number;
  status: "fetched" | "not_found" | "private" | "failed";
  raw: Record<string, unknown>;
};

export async function fetchInstagramProfile(handle: string, leadId?: string): Promise<InstagramProfile | null> {
  if (!env.apifyApiToken) {
    return {
      handle,
      profileUrl: `https://instagram.com/${handle}`,
      followers: null,
      bio: null,
      bioLinks: [],
      lastPostAt: null,
      postCount30d: 0,
      activeLast30Days: false,
      bookingLinkInBio: false,
      detectedPlatform: null,
      platformConfidence: 0,
      status: "failed",
      raw: { error: "APIFY_API_TOKEN missing" },
    };
  }

  try {
    const runId = await startApifyRun([handle]);
    logApiCall({
      provider: "apify",
      endpoint: "instagram_scrape",
      estimatedCostUsd: API_COSTS.apify_instagram_run,
      status: runId ? "success" : "error",
      leadId,
      metadata: { handle },
    });
    if (!runId) return null;
    const items = await pollApifyRunItems(runId, 60_000, 1);
    const result = items[0] ?? null;
    if (!result) return null;
    return parseInstagramResult(handle, result);
  } catch (error) {
    return {
      handle,
      profileUrl: `https://instagram.com/${handle}`,
      followers: null,
      bio: null,
      bioLinks: [],
      lastPostAt: null,
      postCount30d: 0,
      activeLast30Days: false,
      bookingLinkInBio: false,
      detectedPlatform: null,
      platformConfidence: 0,
      status: "failed",
      raw: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

/** Fetch a single Instagram profile (1 Apify run per lead). */
async function startApifyRun(usernames: string[]): Promise<string | null> {
  const response = await fetch(`${APIFY_BASE}/acts/${INSTAGRAM_SCRAPER_ACTOR}/runs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.apifyApiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ usernames, resultsLimit: 1 }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`Apify start failed: ${response.status}`);
  const json = (await response.json()) as { data?: { id?: string } };
  return json.data?.id ?? null;
}

async function pollApifyRunItems(runId: string, timeoutMs: number, limit: number): Promise<Record<string, unknown>[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(3000);
    const response = await fetch(`${APIFY_BASE}/actor-runs/${runId}`, {
      headers: { Authorization: `Bearer ${env.apifyApiToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) continue;
    const run = (await response.json()) as { data?: { status?: string; defaultDatasetId?: string } };
    if (run.data?.status === "SUCCEEDED") {
      const datasetId = run.data.defaultDatasetId;
      if (!datasetId) return [];
      const itemsRes = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?limit=${limit}`, {
        headers: { Authorization: `Bearer ${env.apifyApiToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!itemsRes.ok) return [];
      const items = (await itemsRes.json()) as unknown[];
      return items.filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object");
    }
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(run.data?.status ?? "")) return [];
  }
  return [];
}

/**
 * Batch-fetch multiple Instagram profiles in a single Apify run.
 * Returned map key is lowercase handle.
 */
export async function fetchInstagramProfilesBatch(
  handles: string[],
): Promise<Map<string, InstagramProfile | null>> {
  const map = new Map<string, InstagramProfile | null>();
  if (!handles.length || !env.apifyApiToken) return map;

  try {
    const runId = await startApifyRun(handles);
    logApiCall({
      provider: "apify",
      endpoint: "instagram_scrape_batch",
      estimatedCostUsd: API_COSTS.apify_instagram_run * handles.length * 0.6, // batch is ~40% cheaper per profile
      status: runId ? "success" : "error",
      metadata: { count: handles.length },
    });
    if (!runId) return map;
    const items = await pollApifyRunItems(runId, 120_000, handles.length);
    for (const item of items) {
      const username = typeof item.username === "string" ? item.username.toLowerCase() : null;
      if (username) map.set(username, parseInstagramResult(username, item));
    }
  } catch {
    // non-critical — return empty map
  }
  return map;
}

function parseInstagramResult(handle: string, raw: Record<string, unknown>): InstagramProfile {
  const bioLinks = extractBioLinks(raw);
  const lastPostAt = latestPostDate(raw);
  const activeLast30Days = lastPostAt ? Date.now() - lastPostAt.getTime() < 30 * 24 * 60 * 60 * 1000 : false;
  const detectedPlatform = bioLinks.map(detectPlatformFromUrl).find(Boolean) ?? null;
  const bookingLinkInBio = Boolean(detectedPlatform);

  let status: InstagramProfile["status"] = "fetched";
  if (raw.error || !raw.username) status = "not_found";
  if (raw.isPrivate === true) status = "private";

  return {
    handle,
    profileUrl: `https://instagram.com/${handle}`,
    followers: typeof raw.followersCount === "number" ? raw.followersCount : null,
    bio: typeof raw.biography === "string" ? raw.biography : null,
    bioLinks,
    lastPostAt,
    postCount30d: countPostsLast30Days(raw),
    activeLast30Days,
    bookingLinkInBio,
    detectedPlatform,
    platformConfidence: detectedPlatform ? 0.95 : bioLinks.some((link) => link.includes("linktr.ee")) ? 0.4 : 0,
    status,
    raw,
  };
}

function extractBioLinks(raw: Record<string, unknown>) {
  const links = new Set<string>();
  if (typeof raw.externalUrl === "string") links.add(raw.externalUrl);
  if (Array.isArray(raw.bioLinks)) {
    for (const item of raw.bioLinks) {
      if (item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string") {
        links.add((item as { url: string }).url);
      }
    }
  }
  return [...links];
}

function latestPostDate(raw: Record<string, unknown>) {
  const posts = Array.isArray(raw.latestPosts) ? raw.latestPosts : [];
  for (const post of posts) {
    if (post && typeof post === "object") {
      const timestamp = (post as { timestamp?: unknown }).timestamp;
      if (typeof timestamp === "string" || typeof timestamp === "number") {
        const date = new Date(timestamp);
        if (!Number.isNaN(date.getTime())) return date;
      }
    }
  }
  return null;
}

function countPostsLast30Days(raw: Record<string, unknown>) {
  const posts = Array.isArray(raw.latestPosts) ? raw.latestPosts : [];
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return posts.filter((post) => {
    if (!post || typeof post !== "object") return false;
    const timestamp = (post as { timestamp?: unknown }).timestamp;
    if (typeof timestamp !== "string" && typeof timestamp !== "number") return false;
    return new Date(timestamp).getTime() > cutoff;
  }).length;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
