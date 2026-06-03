import { crawlWebsite } from "@/lib/enrichment/website-crawler";
import { searchWebForChannels, type DiscoveredChannels } from "@/lib/enrichment/web-discovery";
import { enqueueJob } from "@/lib/jobs/queue";
import { getPlaceDetails } from "@/lib/providers/google-places";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SalonLead } from "@/types";

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

  const websiteUrl = (updates.website_url as string | undefined) ?? lead.website_url;
  if (websiteUrl) {
    const crawl = await crawlWebsite(websiteUrl, lead.id);
    await adminClient.from("website_snapshots").upsert(
      {
        lead_id: lead.id,
        url: crawl.url,
        status: crawl.status,
        phones: crawl.phones,
        emails: crawl.emails,
        booking_urls: crawl.booking_urls,
        platform_hits: crawl.platform_hits,
        cta_strength: crawl.cta_strength,
        has_online_booking: crawl.has_online_booking,
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
