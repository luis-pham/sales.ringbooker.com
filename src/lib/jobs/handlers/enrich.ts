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

  // Gate for Serper web discovery: rating >= 3.5, >= 30 reviews, has phone.
  const passesDiscoveryGate =
    (lead.rating ?? 0) >= 3.5 && (lead.review_count ?? 0) >= 30 && !!lead.phone;

  let discovered: DiscoveredChannels | null = null;
  const websiteSoFar = (updates.website_url as string | undefined) ?? lead.website_url;
  const hasNoOnlinePresence = !websiteSoFar && !lead.instagram_url && !lead.facebook_url;

  // Case 1: No online presence in Maps → run web search to find SOCIALS (never a
  // website — Maps is the only website source, so we can't mis-attribute one).
  if (hasNoOnlinePresence && passesDiscoveryGate) {
    discovered = await searchWebForChannels(lead.name, lead.city ?? "", lead.id);
    if (discovered.instagram) updates.instagram_url = discovered.instagram;
    if (discovered.facebook) updates.facebook_url = discovered.facebook;
    if (discovered.tiktok) updates.tiktok_url = discovered.tiktok;
    console.log(`[Enrich] Web discovery (no presence) for ${lead.id}: ${[
      discovered.instagram && "instagram",
      discovered.facebook && "facebook",
      discovered.tiktok && "tiktok",
      discovered.bookingUrls.length && `${discovered.bookingUrls.length} booking`,
    ].filter(Boolean).join(", ") || "nothing found"}`);
  } else if (hasNoOnlinePresence) {
    console.log(`[Enrich] Skip web discovery for ${lead.id}: below quality gate (rating/reviews/phone)`);
  }

  // Review activity: gate lowered to match discovery gate (3.5 / 30).
  if ((lead.rating ?? 0) >= 3.5 && (lead.review_count ?? 0) >= 30) {
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

    // Case 2: a key channel (IG/FB) is still missing after crawling → web search to
    // FILL THE GAPS. Per-channel: finding one channel must not stop us collecting the
    // others, and we only fill what's still empty (never overwrite a real link).
    const hasInstagram = !!(updates.instagram_url ?? lead.instagram_url);
    const hasFacebook  = !!(updates.facebook_url  ?? lead.facebook_url);

    if ((!hasInstagram || !hasFacebook) && passesDiscoveryGate && !discovered) {
      discovered = await searchWebForChannels(lead.name, lead.city ?? "", lead.id);
      if (discovered.instagram && !updates.instagram_url) updates.instagram_url = discovered.instagram;
      if (discovered.facebook  && !updates.facebook_url)  updates.facebook_url  = discovered.facebook;
      if (discovered.tiktok    && !updates.tiktok_url)    updates.tiktok_url    = discovered.tiktok;
      if (discovered.bookingUrls.length > 0) {
        const merged = [...new Set([...bookingUrls, ...discovered.bookingUrls])].slice(0, 5);
        await adminClient.from("website_snapshots")
          .update({ booking_urls: merged, has_online_booking: true })
          .eq("lead_id", lead.id);
      }
      console.log(`[Enrich] Web discovery (fill missing socials) for ${lead.id}: ${[
        discovered.instagram && "instagram",
        discovered.facebook  && "facebook",
        discovered.tiktok    && "tiktok",
        discovered.bookingUrls.length && `${discovered.bookingUrls.length} booking`,
      ].filter(Boolean).join(", ") || "nothing found"}`);
    }
  } else if (discovered && (discovered.bookingUrls.length > 0 || discovered.instagram || discovered.facebook || discovered.tiktok)) {
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

  await adminClient
    .from("salon_leads")
    .update({
      ...updates,
      status: "enriched",
      enriched_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  // Instagram: do NOT queue Apify here — score handler will gate by priority (P1/P2 only).
  // We just ensure instagram_url is saved so score handler can read it.

  await enqueueJob("score_lead", { leadId: lead.id });
}
