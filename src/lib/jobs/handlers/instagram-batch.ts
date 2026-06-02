import { fetchInstagramProfilesBatch } from "@/lib/enrichment/instagram-provider";
import { extractInstagramHandle } from "@/lib/enrichment/website-crawler";
import { enqueueJob } from "@/lib/jobs/queue";
import { createAdminClient } from "@/lib/supabase/admin";

export type InstagramBatchPayload = {
  leads: { leadId: string; handle: string }[];
};

export async function handleInstagramBatch(payload: InstagramBatchPayload) {
  const { leads } = payload;
  if (leads.length === 0) return;

  console.log(`[InstagramBatch] Fetching ${leads.length} profiles in one Apify run`);

  const handles = leads.map((l) => l.handle);
  const profileMap = await fetchInstagramProfilesBatch(handles);

  const adminClient = createAdminClient();

  for (const { leadId, handle } of leads) {
    const profile = profileMap.get(handle.toLowerCase()) ?? null;

    await adminClient.from("instagram_snapshots").upsert(
      {
        lead_id: leadId,
        handle,
        ...(profile
          ? {
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
            }
          : { status: "failed", error: "Not found in batch result" }),
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "lead_id" },
    );

    // Re-score if profile was fetched — Instagram data may improve the score
    if (profile?.status === "fetched") {
      await enqueueJob("score_lead", { leadId });
    }
  }

  console.log(`[InstagramBatch] Done. ${profileMap.size}/${leads.length} profiles fetched.`);
}

export async function handleInstagramBatchQueue() {
  const adminClient = createAdminClient();

  // Don't overlap batches — skip if one is still pending/processing
  const { data: inflight } = await adminClient
    .from("jobs")
    .select("id")
    .eq("type", "instagram_batch")
    .in("status", ["pending", "processing"])
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (inflight) {
    console.log("[InstagramBatchQueue] A batch is already in flight, skipping");
    return;
  }

  // Find P2 leads with an Instagram URL but no snapshot yet.
  // P1 leads are fetched individually right after scoring (see score.ts).
  const { data: pendingLeads } = await adminClient
    .from("salon_leads")
    .select("id, instagram_url, lead_scores!inner(priority)")
    .not("instagram_url", "is", null)
    .not(
      "id",
      "in",
      `(select lead_id from instagram_snapshots where status in ('fetched','not_found','private'))`,
    )
    .eq("lead_scores.priority", 2)
    .limit(50);

  if (!pendingLeads || pendingLeads.length === 0) {
    console.log("[InstagramBatchQueue] No pending P2 leads");
    return;
  }

  const leads = pendingLeads
    .map((l) => ({
      leadId: l.id,
      handle: extractInstagramHandle((l as any).instagram_url ?? "") ?? "",
    }))
    .filter((l) => l.handle !== "");

  if (leads.length === 0) return;

  console.log(`[InstagramBatchQueue] Queuing batch of ${leads.length} profiles`);
  await enqueueJob("instagram_batch", { leads });
}
