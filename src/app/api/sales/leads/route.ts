/**
 * GET /api/sales/leads
 *
 * Returns PipelineLead[] for the Sales CRM — includes instagram_snapshots,
 * outreach_events, and ringbooker_demos in a single query.
 * Separate from /api/leads to avoid bloating that endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/utils/security";
import type { PipelineLead, LeadStage, TimelineEvent } from "@/types";

function toLeadStage(raw: string | null): LeadStage {
  const valid: LeadStage[] = [
    "ready", "sent", "viewed", "hot", "replied",
    "signedup", "onboarding", "trial", "converted", "ghosted", "churned",
  ];
  return valid.includes(raw as LeadStage) ? (raw as LeadStage) : "ready";
}

const SELECT_FIELDS = `
  id,
  name,
  city,
  state,
  categories,
  facebook_url,
  instagram_url,
  sales_stage,
  created_at,
  updated_at,
  instagram_snapshots ( handle, followers ),
  ringbooker_demos ( id, demo_slug, view_count, last_viewed_at ),
  outreach_events ( id, type, notes, metadata, created_at )
`;

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { key: "sales:leads", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { profile } = await getSessionUser();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const pageParam = searchParams.get("page");
  const paginated = pageParam != null;
  const stage = searchParams.get("stage");
  const q = searchParams.get("q");

  const adminClient = createAdminClient();

  // Paginated mode (All Leads table) returns an exact total; default mode (My Day /
  // Kanban) returns up to 200 recent leads without a count.
  let query = paginated
    ? adminClient.from("salon_leads").select(SELECT_FIELDS, { count: "exact" })
    : adminClient.from("salon_leads").select(SELECT_FIELDS);

  query = query.order("updated_at", { ascending: false });
  query = query.order("last_viewed_at", { referencedTable: "ringbooker_demos", ascending: false }).limit(1, { referencedTable: "ringbooker_demos" });
  query = query.order("created_at", { referencedTable: "outreach_events", ascending: false }).limit(5, { referencedTable: "outreach_events" });

  if (profile.role !== "admin") query = query.eq("assigned_to", profile.id);
  if (stage && stage !== "all") query = query.eq("sales_stage", stage);
  if (q) query = query.ilike("name", `%${q}%`);

  let total = 0;
  if (paginated) {
    const perPage = Math.min(100, Math.max(10, Number(searchParams.get("per_page")) || 50));
    const page = Math.max(1, Number(pageParam) || 1);
    const offset = (page - 1) * perPage;
    query = query.range(offset, offset + perPage - 1);
  } else {
    query = query.limit(50);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  total = count ?? 0;

  const leads: PipelineLead[] = (data ?? []).map((row) => {
    const ig = (row.instagram_snapshots as any)?.[0] ?? null;
    const demo = (row.ringbooker_demos as any)?.[0] ?? null;
    const events: any[] = (row.outreach_events as any) ?? [];

    const platform =
      ig ? "Instagram"
      : row.facebook_url ? "Facebook"
      : null;

    const timeline: TimelineEvent[] = events
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((e) => ({
        id: e.id,
        type: (e.metadata?.timeline_type as TimelineEvent["type"]) ?? "note",
        text: e.notes ?? (e.type as string).replaceAll("_", " "),
        date: e.created_at,
      }));

    return {
      id: row.id,
      name: row.name,
      location: [row.city, row.state].filter(Boolean).join(", ") || "Unknown",
      platform: platform as PipelineLead["platform"],
      handle: ig?.handle ?? null,
      followers: ig?.followers != null ? Number(ig.followers).toLocaleString() : null,
      businessType: (row.categories as string[] | null)?.[0] ?? null,
      stage: toLeadStage(row.sales_stage),
      demo: demo
        ? {
            demoId: demo.id,
            slug: demo.demo_slug ?? "",
            plays: demo.view_count ?? 0,
            pct: 0,       // full session data fetched lazily in useDemoTracking
            lastSeen: demo.last_viewed_at ?? null,
            sessions: [],
          }
        : null,
      timeline,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  return NextResponse.json(paginated ? { data: leads, total } : { data: leads });
}
