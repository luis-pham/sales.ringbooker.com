import { detectPlatformFromUrl, getPlatformTier } from "@/lib/enrichment/platform-detector";
import type { InstagramSnapshot, LeadScore, SalonLead, ScoringFactors, WebsiteSnapshot } from "@/types";

export type ScoringInput = {
  lead: SalonLead;
  websiteSnapshot: Pick<
    WebsiteSnapshot,
    "has_online_booking" | "platform_hits" | "booking_urls" | "cta_strength"
  > | null;
  instagramSnapshot: Pick<
    InstagramSnapshot,
    "active_last_30_days" | "booking_link_in_bio" | "detected_platform" | "platform_confidence" | "status" | "followers"
  > | null;
  sourceSnapshot: { raw: Record<string, unknown> | null } | null;
};

export type ScoringResult = Pick<
  LeadScore,
  "score" | "priority" | "factors" | "tier" | "tier_platform" | "tier_reason" | "recommended_pitch" | "scoring_version"
>;

export function calculateScore(input: ScoringInput): ScoringResult {
  const { lead, websiteSnapshot, instagramSnapshot, sourceSnapshot } = input;
  const noOnlineBooking =
    !websiteSnapshot?.has_online_booking &&
    !instagramSnapshot?.booking_link_in_bio &&
    (websiteSnapshot?.booking_urls?.length ?? 0) === 0
      ? 25
      : 0;

  const factors: ScoringFactors = {
    noOnlineBooking,
    businessAge: scoreBusinessAge(sourceSnapshot?.raw),
    ratingScore: scoreRating(lead.rating),
    reviewCount: scoreReviewCount(lead.review_count),
    afterHoursGap: scoreAfterHoursGap(lead),
    instagramActive: scoreInstagramActive(instagramSnapshot),
    hasWebsite: lead.website_url ? 8 : 0,
    respondsToReviews: scoreRespondsToReviews(sourceSnapshot?.raw),
  };

  const score = Math.min(100, Object.values(factors).reduce((sum, value) => sum + value, 0));
  const priority = score >= 70 ? 1 : score >= 50 ? 2 : 3;
  const tier = detectTier(websiteSnapshot, instagramSnapshot);

  return {
    score,
    priority,
    factors,
    tier: tier.tier,
    tier_platform: tier.tier_platform,
    tier_reason: tier.tier_reason,
    recommended_pitch: buildPitch(tier.tier, tier.tier_platform),
    scoring_version: "v1",
  };
}

function scoreBusinessAge(raw: Record<string, unknown> | null | undefined) {
  const reviews = Array.isArray(raw?.reviews) ? raw.reviews : [];
  const dates = reviews
    .map((review) => {
      if (!review || typeof review !== "object") return null;
      const value = (review as { date?: unknown; time?: unknown }).date ?? (review as { time?: unknown }).time;
      if (typeof value === "number") return new Date(value * 1000);
      if (typeof value === "string") return new Date(value);
      return null;
    })
    .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())));

  if (dates.length === 0) return 5;
  const oldest = Math.min(...dates.map((date) => date.getTime()));
  const yearsOld = (Date.now() - oldest) / (1000 * 60 * 60 * 24 * 365);
  if (yearsOld >= 3) return 15;
  if (yearsOld >= 1) return 10;
  if (yearsOld >= 0.5) return 5;
  return 0;
}

function scoreRating(rating: number | null) {
  if (!rating) return 0;
  if (rating >= 4.0 && rating <= 4.5) return 15;
  if (rating > 4.5) return 10;
  if (rating >= 3.5) return 5;
  return 0;
}

function scoreReviewCount(count: number | null) {
  if (!count) return 0;
  if (count >= 50 && count <= 300) return 10;
  if ((count >= 30 && count < 50) || (count > 300 && count <= 500)) return 5;
  if (count >= 15 && count < 30) return 3;
  return 0;
}

function scoreAfterHoursGap(lead: SalonLead) {
  if (lead.closes_before_6pm === true) return 10;
  if (lead.is_open_sunday === false) return 8;
  if (lead.closes_before_6pm === null && lead.is_open_sunday === null) return 5;
  return 0;
}

function scoreInstagramActive(instagram: ScoringInput["instagramSnapshot"]) {
  if (!instagram || instagram.status === "not_found" || instagram.status === "failed") return 0;
  if (instagram.status === "private") return 3;
  if (instagram.active_last_30_days) return 10;
  if (instagram.followers && instagram.followers > 0) return 5;
  return 3;
}

function scoreRespondsToReviews(raw: Record<string, unknown> | null | undefined) {
  const reviews = Array.isArray(raw?.reviews) ? raw.reviews : [];
  return reviews.some((review) => {
    if (!review || typeof review !== "object") return false;
    const row = review as Record<string, unknown>;
    return Boolean(row.ownerResponse || row.owner_response || row.replyTime);
  })
    ? 7
    : 0;
}

function detectTier(
  website: ScoringInput["websiteSnapshot"],
  instagram: ScoringInput["instagramSnapshot"],
): { tier: "A" | "B" | "C"; tier_platform: string | null; tier_reason: string } {
  const sources: Array<{ platform: string; source: string; confidence: number }> = [];
  for (const hit of website?.platform_hits ?? []) {
    sources.push({ platform: hit.platform, source: "website", confidence: hit.confidence });
  }
  for (const url of website?.booking_urls ?? []) {
    const platform = detectPlatformFromUrl(url);
    if (platform) sources.push({ platform, source: "booking_url", confidence: 0.9 });
  }
  if (instagram?.detected_platform && instagram.platform_confidence) {
    sources.push({
      platform: instagram.detected_platform,
      source: "instagram_bio",
      confidence: instagram.platform_confidence,
    });
  }
  sources.sort((a, b) => b.confidence - a.confidence);
  const best = sources[0];
  if (!best) return { tier: "C", tier_platform: null, tier_reason: "no_platform_detected" };
  return {
    tier: getPlatformTier(best.platform),
    tier_platform: best.platform,
    tier_reason: `${best.platform}_via_${best.source}`,
  };
}

function buildPitch(tier: "A" | "B" | "C" | null, platform: string | null) {
  if (tier === "A") {
    if (platform === "square") return "AI books directly into Square while the salon is busy with clients.";
    if (platform === "vagaro") return "AI answers calls and books into Vagaro so no caller waits.";
    return "AI books appointments directly into their calendar and reduces missed calls.";
  }
  if (tier === "B") {
    return "AI answers every call and instantly texts the existing booking link.";
  }
  return "AI captures every caller's name, number, and service request so the salon stops losing leads.";
}
