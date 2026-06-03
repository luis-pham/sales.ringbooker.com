import { detectPlatformFromUrl, getPlatformTier } from "@/lib/enrichment/platform-detector";
import type { InstagramSnapshot, LeadScore, SalonLead, ScoringFactors, WebsiteSnapshot } from "@/types";

export type ScoringInput = {
  lead: SalonLead;
  websiteSnapshot: Pick<
    WebsiteSnapshot,
    "has_online_booking" | "platform_hits" | "booking_urls" | "cta_strength" | "status"
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
  const { lead, websiteSnapshot, instagramSnapshot } = input;

  const hasBookingPlatform =
    Boolean(websiteSnapshot?.has_online_booking) ||
    Boolean(instagramSnapshot?.booking_link_in_bio) ||
    (websiteSnapshot?.booking_urls?.length ?? 0) > 0;

  // The opportunity is an ACTIVE, reachable salon that lacks online booking — not a
  // ghost listing. Require some online footprint (website / social / a real review
  // base) before crediting "no online booking"; otherwise a salon with no website,
  // no socials and few reviews banks 25 points just for having no data. Also, outreach
  // happens via IG/FB DM, so a salon with no socials and no website isn't actionable.
  const hasOnlineFootprint =
    Boolean(lead.website_url) ||
    Boolean(lead.instagram_url) ||
    Boolean(lead.facebook_url) ||
    (lead.review_count ?? 0) >= 50;

  // "No online booking" is the core opportunity signal — but only credit it when we
  // ACTUALLY inspected the site. A failed/blocked crawl is "unknown", not "confirmed
  // no booking"; granting 25 pts there fabricates P1 leads from crawl failures.
  // status "crawled" = HTML fetched & parsed; "skipped" = no site but web-discovery ran.
  const crawlInspected =
    !websiteSnapshot ||
    websiteSnapshot.status === "crawled" ||
    websiteSnapshot.status === "skipped";

  const noOnlineBooking = !hasBookingPlatform && hasOnlineFootprint && crawlInspected ? 25 : 0;

  const lastReviewAt = lead.last_review_at ? new Date(lead.last_review_at) : null;

  const factors: ScoringFactors = {
    noOnlineBooking,
    activityRecency: scoreActivityRecency(lastReviewAt, lead.review_count),
    ratingScore: scoreRating(lead.rating),
    reviewCount: scoreReviewCount(lead.review_count),
    afterHoursGap: scoreAfterHoursGap(lead),
    instagramActive: scoreInstagramActive(instagramSnapshot),
    hasWebsite: lead.website_url ? 8 : 0,
    respondsToReviews: lead.owner_responds_reviews ? 5 : 0,
  };

  const score = Math.min(100, Object.values(factors).reduce((sum, value) => sum + value, 0));
  let priority: 1 | 2 | 3 = score >= 70 ? 1 : score >= 50 ? 2 : 3;

  // Hard signal: a business with no reviews in 3+ years is likely closed/inactive —
  // don't spend outreach on it regardless of other factors.
  if (lastReviewAt && Date.now() - lastReviewAt.getTime() > 3 * 365 * 24 * 60 * 60 * 1000) {
    priority = 3;
  }

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

function scoreActivityRecency(lastReviewAt: Date | null, reviewCount: number | null) {
  // Primary: how recently the salon got a review = is it still active? (max 13)
  if (lastReviewAt) {
    const months = (Date.now() - lastReviewAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (months <= 3) return 13;   // very active
    if (months <= 12) return 10;  // active this year
    if (months <= 24) return 5;   // slowing down
    if (months <= 36) return 2;   // stale
    return 0;                      // 3+ years silent (also capped to P3 below)
  }

  // Fallback: reviews not fetched (lead below the review gate) — use review volume
  // as a weak establishment proxy so the factor isn't flat for everyone.
  const c = reviewCount ?? 0;
  if (c >= 150) return 9;
  if (c >= 60) return 6;
  if (c >= 20) return 4;
  return 2;
}

function scoreRating(rating: number | null) {
  // Monotonic: higher reputation = better lead (no sweet-spot penalty)
  if (!rating) return 0;
  if (rating >= 4.5) return 15;
  if (rating >= 4.0) return 12;
  if (rating >= 3.5) return 7;
  if (rating >= 3.0) return 3;
  return 0;
}

function scoreReviewCount(count: number | null) {
  // Monotonic: more reviews = more established = better lead (never drops to 0)
  if (!count) return 0;
  if (count >= 200) return 12;
  if (count >= 100) return 10;
  if (count >= 50) return 8;
  if (count >= 20) return 5;
  if (count >= 5) return 2;
  return 1;
}

function scoreAfterHoursGap(lead: SalonLead) {
  // Core product signal — closing early / no Sunday = missed after-hours calls
  if (lead.closes_before_6pm === true) return 12;
  if (lead.is_open_sunday === false) return 9;
  if (lead.closes_before_6pm === null && lead.is_open_sunday === null) return 6;
  return 0;
}

function scoreInstagramActive(instagram: ScoringInput["instagramSnapshot"]) {
  if (!instagram || instagram.status === "not_found" || instagram.status === "failed") return 0;
  if (instagram.status === "private") return 3;
  if (instagram.active_last_30_days) return 10;
  if (instagram.followers && instagram.followers > 0) return 5;
  return 3;
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
