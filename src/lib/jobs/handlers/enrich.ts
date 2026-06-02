import { crawlWebsite } from "@/lib/enrichment/website-crawler";
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

  const websiteUrl = (updates.website_url as string | undefined) ?? lead.website_url;
  if (websiteUrl) {
    const crawl = await crawlWebsite(websiteUrl);
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
