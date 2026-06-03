import { crawlWebsite } from "@/lib/enrichment/website-crawler";
import { searchWebForChannels, type DiscoveredChannels } from "@/lib/enrichment/web-discovery";
import { enqueueJob } from "@/lib/jobs/queue";
import { getPlaceDetails } from "@/lib/providers/google-places";
import { fetchPlaceReviews } from "@/lib/providers/serper-reviews";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SalonLead } from "@/types";

function extractCid(mapsUrl: string | null): string | null {
  if (!mapsUrl) return null;
  const m = mapsUrl.match(/[?&]cid=(\d+)/);
  return m?.[1] ?? null;
}

export type EnrichLeadPayload = {
  leadId: string;
};

export async function handleEnrichLead(payload: EnrichLeadPayload) {
  const adminClient = createAdminClient();
  const { data: lead } = await adminClient
    .from("salon_leads")
    .select("*")
    .eq("id", payload.leadId)
    .single<SalonLead>();

  if (!lead) throw new Error(`Lead not found: ${payload.leadId}`);

  await adminClient.from("salon_leads").update({ status: "enriching" }).eq("id", lead.id);

  const updates: Record<string, unknown> = {};

  // Google Places: only call when hours data is missing AND lead passes quality threshold.
  // Serper already populates is_open_sunday + closes_before_6pm for most leads, so
  // this call is only needed for leads where Serper returned no openingHours.
  const needsPlacesAPI =
    lead.google_place_id !== null &&
    lead.closes_before_6pm === null &&
    lead.is_open_sunday === null &&
    (lead.rating ?? 0) >= 3.5 &&
    (lead.review_count ?? 0) >= 15;

  if (needsPlacesAPI) {
    const details = await getPlaceDetails(lead.google_place_id!, lead.id);
    if (details) {
      if (!lead.phone && details.phone) updates.phone = details.phone;
      if (!lead.website_url && details.website_url) updates.website_url = details.website_url;
      if (details.hours_raw) updates.hours_raw = details.hours_raw;
      if (details.is_open_sunday !== null) updates.is_open_sunday = details.is_open_sunday;
      if (details.closes_before_6pm !== null) updates.closes_before_6pm = details.closes_before_6pm;
    }
  } else {
    const skipReason =
      !lead.google_place_id ? "no_place_id" :
      lead.closes_before_6pm !== null || lead.is_open_sunday !== null ? "hours_from_serper" :
      (lead.rating ?? 0) < 3.5 ? "low_rating" :
      "low_review_count";
    console.log(`[Enrich] Skip Places API for ${lead.id}: ${skipReason}`);
  }

  // Web discovery: when Maps returned no website/socials for a high-quality salon,
  // run a Serper web search to find the salon's channels. Gated tightly to control cost:
  // rating >= 4.0, >= 50 reviews, has phone.
  let discovered: DiscoveredChannels | null = null;
  const websiteSoFar = (updates.website_url as string | undefined) ?? lead.website_url;
  const hasNoOnlinePresence = !websiteSoFar && !lead.instagram_url && !lead.facebook_url;
  const passesDiscoveryGate =
    (lead.rating ?? 0) >= 4.0 && (lead.review_count ?? 0) >= 50 && !!lead.phone;

  if (hasNoOnlinePresence && passesDiscoveryGate) {
    discovered = await searchWebForChannels(lead.name, lead.city ?? "", lead.id);
    if (discovered.website) updates.website_url = discovered.website;
    if (discovered.instagram) updates.instagram_url = discovered.instagram;
    if (discovered.facebook) updates.facebook_url = discovered.facebook;
    if (discovered.tiktok) updates.tiktok_url = discovered.tiktok;
    console.log(`[Enrich] Web discovery for ${lead.id}: ${[
      discovered.website && "website",
      discovered.instagram && "instagram",
      discovered.facebook && "facebook",
      discovered.tiktok && "tiktok",
      discovered.bookingUrls.length && `${discovered.bookingUrls.length} booking`,
    ].filter(Boolean).join(", ") || "nothing found"}`);
  } else if (hasNoOnlinePresence) {
    console.log(`[Enrich] Skip web discovery for ${lead.id}: below quality gate (rating/reviews/phone)`);
  }

  // Review activity: for promising leads, fetch recent Google reviews to verify the
  // business is still active (recency) and whether the owner engages (responds). Gated
  // to rating >= 4 and >= 50 reviews so we only spend on leads worth pursuing.
  if ((lead.rating ?? 0) >= 4.0 && (lead.review_count ?? 0) >= 50) {
    const reviews = await fetchPlaceReviews(
      { placeId: lead.google_place_id, cid: extractCid(lead.google_maps_url) },
      lead.id,
    );
    if (reviews.lastReviewAt) updates.last_review_at = reviews.lastReviewAt.toISOString();
    if (reviews.ownerRespondsToReviews) updates.owner_responds_reviews = true;
    console.log(
      `[Enrich] Reviews for ${lead.id}: last=${reviews.lastReviewAt?.toISOString().slice(0, 10) ?? "?"}, ` +
      `ownerResponds=${reviews.ownerRespondsToReviews}, n=${reviews.reviewsFetched}`,
    );
  }

  const websiteUrl = (updates.website_url as string | undefined) ?? lead.website_url;
  if (websiteUrl) {
    const crawl = await crawlWebsite(websiteUrl, lead.id);
    // Merge booking platforms found via web search (e.g. vagaro.com/salon) into the
    // crawl result — a booking link from the web search counts as having a booking platform.
    const bookingUrls = [...new Set([...crawl.booking_urls, ...(discovered?.bookingUrls ?? [])])].slice(0, 5);
    const hasOnlineBooking = crawl.has_online_booking || bookingUrls.length > 0;
    await adminClient.from("website_snapshots").upsert(
      {
        lead_id: lead.id,
        url: crawl.url,
        status: crawl.status,
        phones: crawl.phones,
        emails: crawl.emails,
        booking_urls: bookingUrls,
        platform_hits: crawl.platform_hits,
        cta_strength: crawl.cta_strength,
        has_online_booking: hasOnlineBooking,
        has_phone_visible: crawl.has_phone_visible,
        instagram_links: crawl.instagram_links,
        facebook_links: crawl.facebook_links,
        tiktok_links: crawl.tiktok_links,
        response_status: crawl.response_status,
        error: crawl.error ?? null,
        crawl_duration_ms: crawl.crawl_duration_ms,
        crawled_at: new Date().toISOString(),
      },
      { onConflict: "lead_id" },
    );

    if (!lead.phone && crawl.phones[0]) updates.phone = crawl.phones[0];
    if (!lead.instagram_url && crawl.instagram_links[0]) updates.instagram_url = crawl.instagram_links[0];
    if (!lead.facebook_url && crawl.facebook_links[0]) updates.facebook_url = crawl.facebook_links[0];
    if (!lead.tiktok_url && crawl.tiktok_links[0]) updates.tiktok_url = crawl.tiktok_links[0];
  } else if (discovered && (discovered.bookingUrls.length > 0 || discovered.instagram || discovered.facebook || discovered.tiktok)) {
    // No crawlable website, but the web search found booking/social signals.
    // Persist them as a snapshot so the scoring engine can detect online booking
    // and platform tier even without a website to crawl.
    await adminClient.from("website_snapshots").upsert(
      {
        lead_id: lead.id,
        url: discovered.bookingUrls[0] ?? discovered.yelp ?? `https://www.google.com/search?q=${encodeURIComponent(lead.name)}`,
        status: "skipped",
        booking_urls: discovered.bookingUrls,
        has_online_booking: discovered.bookingUrls.length > 0,
        instagram_links: discovered.instagram ? [discovered.instagram] : [],
        facebook_links: discovered.facebook ? [discovered.facebook] : [],
        tiktok_links: discovered.tiktok ? [discovered.tiktok] : [],
        crawled_at: new Date().toISOString(),
      },
      { onConflict: "lead_id" },
    );
  }

  // Check if any social presence was found from any source
  const finalInstagram = (updates.instagram_url as string | undefined) ?? lead.instagram_url;
  const finalFacebook  = (updates.facebook_url  as string | undefined) ?? lead.facebook_url;
  const finalTiktok    = (updates.tiktok_url    as string | undefined) ?? lead.tiktok_url;

  const websiteSnapshot = await adminClient
    .from("website_snapshots")
    .select("instagram_links, facebook_links, tiktok_links")
    .eq("lead_id", lead.id)
    .maybeSingle<{ instagram_links: string[]; facebook_links: string[]; tiktok_links: string[] }>();

  const snapshotHasSocial =
    (websiteSnapshot.data?.instagram_links?.length ?? 0) > 0 ||
    (websiteSnapshot.data?.facebook_links?.length  ?? 0) > 0 ||
    (websiteSnapshot.data?.tiktok_links?.length    ?? 0) > 0;

  const hasSocial = !!finalInstagram || !!finalFacebook || !!finalTiktok || snapshotHasSocial;

  // Disqualify leads with no social presence found anywhere after full enrichment
  const finalStatus = hasSocial ? "enriched" : "disqualified";
  if (!hasSocial) {
    console.log(`[Enrich] Disqualifying ${lead.id} (${lead.name}): no social found after full enrichment`);
  }

  await adminClient
    .from("salon_leads")
    .update({
      ...updates,
      status: finalStatus,
      enriched_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  if (!hasSocial) return; // no point scoring a disqualified lead

  // Instagram: do NOT queue Apify here — score handler will gate by priority (P1/P2 only).
  // We just ensure instagram_url is saved so score handler can read it.

  await enqueueJob("score_lead", { leadId: lead.id });
}
