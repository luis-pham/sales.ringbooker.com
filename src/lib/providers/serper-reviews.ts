import { env } from "@/lib/env";
import { logApiCall, API_COSTS } from "@/lib/api-logger";

export type PlaceReviewsResult = {
  lastReviewAt: Date | null;
  ownerRespondsToReviews: boolean;
  reviewsFetched: number;
};

const EMPTY: PlaceReviewsResult = { lastReviewAt: null, ownerRespondsToReviews: false, reviewsFetched: 0 };

type SerperReview = {
  isoDate?: string;
  date?: string;
  publishedAtDate?: string;
  rating?: number;
  // owner/business response — Serper has used a few shapes over time
  response?: unknown;
  responseFromOwnerText?: unknown;
  ownerResponse?: unknown;
};

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hasOwnerResponse(review: SerperReview): boolean {
  return Boolean(review.response || review.responseFromOwnerText || review.ownerResponse);
}

/**
 * Fetch recent Google reviews via Serper's /reviews endpoint.
 * Accepts placeId (ChIJ...) or cid (numeric). Returns the most recent review date
 * (for activity/recency scoring) and whether the owner responds to reviews.
 * Best-effort: returns empty result if no credentials/ids or the call fails.
 */
export async function fetchPlaceReviews(
  opts: { placeId?: string | null; cid?: string | null },
  leadId?: string,
): Promise<PlaceReviewsResult> {
  if (!env.serperApiKey) return EMPTY;

  // Prefer placeId (ChIJ...); fall back to cid (numeric) which Serper also accepts.
  const body: Record<string, unknown> = { sortBy: "newest" };
  if (opts.placeId && !/^\d+$/.test(opts.placeId)) body.placeId = opts.placeId;
  else if (opts.cid) body.cid = String(opts.cid);
  else return EMPTY;

  let reviews: SerperReview[] = [];
  try {
    const response = await fetch("https://google.serper.dev/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": env.serperApiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

    logApiCall({
      provider: "serper",
      endpoint: "reviews",
      estimatedCostUsd: response.ok ? API_COSTS.serper_reviews : 0,
      status: response.ok ? "success" : "error",
      leadId,
      metadata: { ...body },
    });

    if (!response.ok) return EMPTY;
    const json = (await response.json()) as { reviews?: SerperReview[] };
    reviews = Array.isArray(json.reviews) ? json.reviews : [];
  } catch {
    return EMPTY;
  }

  if (reviews.length === 0) return EMPTY;

  let lastReviewAt: Date | null = null;
  let ownerResponds = false;
  for (const review of reviews) {
    const date = parseDate(review.isoDate) ?? parseDate(review.publishedAtDate) ?? parseDate(review.date);
    if (date && (!lastReviewAt || date > lastReviewAt)) lastReviewAt = date;
    if (hasOwnerResponse(review)) ownerResponds = true;
  }

  return { lastReviewAt, ownerRespondsToReviews: ownerResponds, reviewsFetched: reviews.length };
}
