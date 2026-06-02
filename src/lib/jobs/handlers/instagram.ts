import { fetchInstagramProfile } from "@/lib/enrichment/instagram-provider";
import { enqueueJob } from "@/lib/jobs/queue";
import { createAdminClient } from "@/lib/supabase/admin";

export type EnrichInstagramPayload = {
  leadId: string;
  instagramHandle: string;
};

export async function handleEnrichInstagram(payload: EnrichInstagramPayload) {
  const adminClient = createAdminClient();
  const profile = await fetchInstagramProfile(payload.instagramHandle, payload.leadId);

  if (!profile) {
    await adminClient.from("instagram_snapshots").upsert(
      {
        lead_id: payload.leadId,
        handle: payload.instagramHandle,
        status: "failed",
        error: "No profile returned",
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "lead_id" },
    );
    return;
  }

  await adminClient.from("instagram_snapshots").upsert(
    {
      lead_id: payload.leadId,
      handle: profile.handle,
      profile_url: profile.profileUrl,
      followers: profile.followers,
      bio: profile.bio,
      bio_links: profile.bioLinks,
      last_post_at: profile.lastPostAt?.toISOString() ?? null,
      post_count_30d: profile.postCount30d,
      active_last_30_days: profile.activeLast30Days,
      booking_link_in_bio: profile.bookingLinkInBio,
      detected_platform: profile.detectedPlatform,
      platform_confidence: profile.platformConfidence,
      status: profile.status,
      raw: profile.raw,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "lead_id" },
  );

  await adminClient
    .from("salon_leads")
    .update({ instagram_url: profile.profileUrl })
    .eq("id", payload.leadId)
    .is("instagram_url", null);

  await enqueueJob("score_lead", { leadId: payload.leadId });
}
