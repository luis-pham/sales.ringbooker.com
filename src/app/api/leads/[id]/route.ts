import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireLeadAccess } from "@/lib/auth/access";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity, enforceRateLimit } from "@/lib/utils/security";

const updateSchema = z.object({
  status: z.enum([
    "dm_sent",
    "replied",
    "demo_shared",
    "demo_viewed",
    "demo_completed",
    "follow_up_needed",
    "converted",
    "lost",
    "disqualified",
  ]).optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(_request, { key: "lead:get", limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { profile } = await getSessionUser();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("salon_leads")
    .select(`
      id, name, phone, address, city, state, categories,
      website_url, google_maps_url, rating, review_count,
      facebook_url, instagram_url, sales_stage, assigned_to,
      created_at, updated_at, enriched_at, scored_at,
      has_social, has_phone_visible, closes_before_6pm, is_open_sunday,
      hours_raw, lat, lng, status, metadata,
      lead_scores(score, priority, tier, tier_platform, recommended_pitch, factors),
      website_snapshots(status, has_online_booking, has_phone_visible, booking_urls, instagram_links, facebook_links, crawled_at, error),
      instagram_snapshots(handle, followers, profile_url, bio, last_post_at, post_count_30d, active_last_30_days, booking_link_in_bio, detected_platform),
      ringbooker_demos(id, demo_slug, view_count, last_viewed_at),
      outreach_events(id, type, notes, metadata, created_at, created_by),
      follow_ups(id, type, notes, scheduled_for, completed_at, created_at)
    `)
    .eq("id", id)
    .order("last_viewed_at", { referencedTable: "ringbooker_demos", ascending: false })
    .limit(3, { referencedTable: "ringbooker_demos" })
    .order("created_at", { referencedTable: "outreach_events", ascending: false })
    .limit(20, { referencedTable: "outreach_events" })
    .order("scheduled_for", { referencedTable: "follow_ups", ascending: true })
    .limit(10, { referencedTable: "follow_ups" })
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  if (profile.role !== "admin" && data.assigned_to !== profile.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = enforceMutationSecurity(request, { key: "lead:patch", limit: 60, windowMs: 60_000 });
  if (security) return security;
  const { profile } = await getSessionUser();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { id } = await params;
  const adminClient = createAdminClient();
  try {
    await requireLeadAccess(adminClient, id, profile);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { data, error } = await adminClient
    .from("salon_leads")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
