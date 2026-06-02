import { extractInstagramHandle, crawlWebsite } from "@/lib/enrichment/website-crawler";
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
  if (lead.google_place_id && (!lead.website_url || !lead.hours_raw || !lead.phone)) {
    const details = await getPlaceDetails(lead.google_place_id, lead.id);
    if (details) {
      if (!lead.phone && details.phone) updates.phone = details.phone;
      if (!lead.website_url && details.website_url) updates.website_url = details.website_url;
      if (!lead.hours_raw && details.hours_raw) updates.hours_raw = details.hours_raw;
      if (details.is_open_sunday !== null) updates.is_open_sunday = details.is_open_sunday;
      if (details.closes_before_6pm !== null) updates.closes_before_6pm = details.closes_before_6pm;
      if (details.rating !== null) updates.rating = details.rating;
      if (details.review_count !== null) updates.review_count = details.review_count;
    }
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

  const instagramUrl = (updates.instagram_url as string | undefined) ?? lead.instagram_url;
  const handle = instagramUrl ? extractInstagramHandle(instagramUrl) : null;
  if (handle) await enqueueJob("enrich_instagram", { leadId: lead.id, instagramHandle: handle });

  await enqueueJob("score_lead", { leadId: lead.id });
}
