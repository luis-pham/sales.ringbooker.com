import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/utils/security";
import type { LeadStage, PipelineLead } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const LEAD_SELECT = `
  id,
  name,
  city,
  state,
  categories,
  assigned_to,
  sales_stage,
  updated_at,
  created_at,
  instagram_url,
  facebook_url,
  ringbooker_demos ( id, demo_slug, view_count, last_viewed_at ),
  outreach_events ( created_at, created_by )
`;

type SalesLeadItem = PipelineLead & {
  city: string | null;
  state: string | null;
  sales_stage: LeadStage;
  assigned_to: string | null;
  updated_at: string;
  instagram_url: string | null;
  facebook_url: string | null;
  lastActionAt: string | null;
  daysSinceLastAction: number | null;
};

type Group = { count: number; leads: SalesLeadItem[] };

function vnNow() {
  return new Date(Date.now() - VN_OFFSET_MS * -1);
}

function startOfTodayVnIso() {
  const shifted = vnNow();
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - VN_OFFSET_MS).toISOString();
}

function thresholdVnIso(days: number) {
  return new Date(vnNow().getTime() - days * DAY_MS - VN_OFFSET_MS).toISOString();
}

function toLeadStage(raw: string | null): LeadStage {
  const valid: LeadStage[] = [
    "ready", "sent", "viewed", "hot", "replied",
    "signedup", "onboarding", "trial", "converted", "ghosted", "churned",
  ];
  return valid.includes(raw as LeadStage) ? (raw as LeadStage) : "ready";
}

function daysSince(iso: string | null) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS));
}

function toSalesLead(row: any): SalesLeadItem {
  const demo = row.ringbooker_demos?.[0] ?? null;
  const latestAction = row.outreach_events?.[0]?.created_at ?? null;
  const stage = toLeadStage(row.sales_stage);
  const platform: PipelineLead["platform"] = row.instagram_url
    ? "Instagram"
    : row.facebook_url
    ? "Facebook"
    : null;

  return {
    id: row.id,
    name: row.name,
    city: row.city ?? null,
    state: row.state ?? null,
    sales_stage: stage,
    assigned_to: row.assigned_to ?? null,
    updated_at: row.updated_at,
    instagram_url: row.instagram_url ?? null,
    facebook_url: row.facebook_url ?? null,
    location: [row.city, row.state].filter(Boolean).join(", ") || "Unknown",
    platform,
    handle: null,
    followers: null,
    businessType: (row.categories as string[] | null)?.[0] ?? null,
    stage,
    demo: demo
      ? {
          demoId: demo.id,
          slug: demo.demo_slug ?? "",
          plays: demo.view_count ?? 0,
          pct: 0,
          lastSeen: demo.last_viewed_at ?? null,
          sessions: [],
        }
      : null,
    timeline: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActionAt: latestAction,
    daysSinceLastAction: daysSince(latestAction),
  };
}

function recentActionByRepSubquery(repId: string, thresholdIso?: string) {
  const threshold = thresholdIso ? ` and created_at >= '${thresholdIso}'` : "";
  return `(select lead_id from outreach_events where created_by = '${repId}'${threshold})`;
}

function toPostgrestInList(ids: string[]) {
  return `(${ids.join(",")})`;
}

async function getPreparedDemoLeadIds(db: any): Promise<string[]> {
  const { data } = await db
    .from("ringbooker_demos")
    .select("lead_id")
    .eq("status", "prepared");

  return (data ?? []).map((r: any) => r.lead_id as string);
}

async function getUrgentLeadIds(db: any, thresholdIso: string): Promise<string[]> {
  const { data: candidates } = await db
    .from("salon_leads")
    .select("id, assigned_to")
    .eq("status", "outreach_ready")
    .in("sales_stage", ["hot", "trial", "replied"])
    .not("assigned_to", "is", null);

  if (!candidates?.length) return [];

  const { data: recentEvents } = await db
    .from("outreach_events")
    .select("lead_id, created_by")
    .in("lead_id", candidates.map((c: any) => c.id))
    .gte("created_at", thresholdIso);

  const assignedMap = new Map(candidates.map((c: any) => [c.id, c.assigned_to]));
  const recentSet = new Set(
    (recentEvents ?? [])
      .filter((e: any) => e.created_by === assignedMap.get(e.lead_id))
      .map((e: any) => e.lead_id),
  );

  return candidates
    .filter((c: any) => !recentSet.has(c.id))
    .map((c: any) => c.id);
}

function withLeadShape(query: any, createdBy?: string) {
  let q = query
    .order("updated_at", { ascending: false })
    .order("last_viewed_at", { referencedTable: "ringbooker_demos", ascending: false })
    .limit(1, { referencedTable: "ringbooker_demos" })
    .order("created_at", { referencedTable: "outreach_events", ascending: false })
    .limit(1, { referencedTable: "outreach_events" });

  if (createdBy) q = q.eq("outreach_events.created_by", createdBy);
  return q;
}

async function runGroup(countQuery: any, leadsQuery: any): Promise<Group> {
  const [{ count }, { data }] = await Promise.all([countQuery, leadsQuery]);
  return {
    count: count ?? 0,
    leads: (data ?? []).map(toSalesLead),
  };
}

function emptyGroup(): Group {
  return { count: 0, leads: [] };
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { key: "sales:my-day", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { user, profile } = await getSessionUser();
  if (!user || !profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const oneDayAgo = thresholdVnIso(1);
  const twoDaysAgo = thresholdVnIso(2);
  const todayStart = startOfTodayVnIso();

  if (profile.role === "admin") {
    const [preparedDemoIds, urgentIds] = await Promise.all([
      getPreparedDemoLeadIds(db),
      getUrgentLeadIds(db, oneDayAgo),
    ]);

    const urgent = urgentIds.length === 0
      ? Promise.resolve(emptyGroup())
      : runGroup(
        db.from("salon_leads")
          .select("id", { count: "exact", head: true })
          .eq("status", "outreach_ready")
          .in("sales_stage", ["hot", "trial", "replied"])
          .not("assigned_to", "is", null)
          .in("id", urgentIds),
        withLeadShape(
          db.from("salon_leads")
            .select(LEAD_SELECT)
            .eq("status", "outreach_ready")
            .in("sales_stage", ["hot", "trial", "replied"])
            .not("assigned_to", "is", null)
            .in("id", urgentIds)
            .limit(5),
        ),
      );

    const assignedTodayCount = db.from("salon_leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "outreach_ready")
      .gte("assigned_at", todayStart);

    const assignedTodayLeads = withLeadShape(
      db.from("salon_leads")
        .select(LEAD_SELECT)
        .eq("status", "outreach_ready")
        .gte("assigned_at", todayStart)
        .limit(5),
    );

    const readyToAssign = preparedDemoIds.length === 0
      ? Promise.resolve(emptyGroup())
      : runGroup(
        db.from("salon_leads")
          .select("id", { count: "exact", head: true })
          .eq("status", "outreach_ready")
          .eq("sales_stage", "ready")
          .is("assigned_to", null)
          .in("id", preparedDemoIds),
        withLeadShape(
          db.from("salon_leads")
            .select(LEAD_SELECT)
            .eq("status", "outreach_ready")
            .eq("sales_stage", "ready")
            .is("assigned_to", null)
            .in("id", preparedDemoIds)
            .limit(5),
        ),
      );

    let waitingDemoCount = db.from("salon_leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "outreach_ready")
      .eq("sales_stage", "ready")
      .eq("has_social", true)
      .is("assigned_to", null);

    let waitingDemoLeadsQuery = db.from("salon_leads")
      .select(LEAD_SELECT)
      .eq("status", "outreach_ready")
      .eq("has_social", true)
      .eq("sales_stage", "ready")
      .is("assigned_to", null);

    if (preparedDemoIds.length > 0) {
      const preparedDemoIdList = toPostgrestInList(preparedDemoIds);
      waitingDemoCount = waitingDemoCount.not("id", "in", preparedDemoIdList);
      waitingDemoLeadsQuery = waitingDemoLeadsQuery.not("id", "in", preparedDemoIdList);
    }

    const waitingDemoLeads = withLeadShape(waitingDemoLeadsQuery.limit(5));

    const [
      urgentGroup,
      assignedToday,
      readyToAssignGroup,
      waitingDemo,
    ] = await Promise.all([
      urgent,
      runGroup(assignedTodayCount, assignedTodayLeads),
      readyToAssign,
      runGroup(waitingDemoCount, waitingDemoLeads),
    ]);

    return NextResponse.json({
      data: {
        urgent: urgentGroup,
        assignedToday,
        readyToAssign: readyToAssignGroup,
        waitingDemo,
      },
    });
  }

  const doNowCount = db.from("salon_leads")
    .select("id", { count: "exact", head: true })
    .eq("status", "outreach_ready")
    .eq("assigned_to", profile.id)
    .in("sales_stage", ["viewed", "hot", "replied"])
    .not("id", "in", recentActionByRepSubquery(profile.id, oneDayAgo));

  const doNowLeads = withLeadShape(
    db.from("salon_leads")
      .select(LEAD_SELECT)
      .eq("status", "outreach_ready")
      .eq("assigned_to", profile.id)
      .in("sales_stage", ["viewed", "hot", "replied"])
      .not("id", "in", recentActionByRepSubquery(profile.id, oneDayAgo))
      .limit(8),
    profile.id,
  );

  const followUpCount = db.from("salon_leads")
    .select("id", { count: "exact", head: true })
    .eq("status", "outreach_ready")
    .eq("assigned_to", profile.id)
    .eq("sales_stage", "sent")
    .not("id", "in", recentActionByRepSubquery(profile.id, twoDaysAgo));

  const followUpLeads = withLeadShape(
    db.from("salon_leads")
      .select(LEAD_SELECT)
      .eq("status", "outreach_ready")
      .eq("assigned_to", profile.id)
      .eq("sales_stage", "sent")
      .not("id", "in", recentActionByRepSubquery(profile.id, twoDaysAgo))
      .limit(8),
    profile.id,
  );

  const newDmsCount = db.from("salon_leads")
    .select("id", { count: "exact", head: true })
    .eq("status", "outreach_ready")
    .eq("assigned_to", profile.id)
    .in("sales_stage", ["sent", "ready"])
    .not("id", "in", recentActionByRepSubquery(profile.id));

  const newDmsLeads = withLeadShape(
    db.from("salon_leads")
      .select(LEAD_SELECT)
      .eq("status", "outreach_ready")
      .eq("assigned_to", profile.id)
      .in("sales_stage", ["sent", "ready"])
      .not("id", "in", recentActionByRepSubquery(profile.id))
      .limit(8),
    profile.id,
  );

  const [doNow, followUp, newDMs] = await Promise.all([
    runGroup(doNowCount, doNowLeads),
    runGroup(followUpCount, followUpLeads),
    runGroup(newDmsCount, newDmsLeads),
  ]);

  return NextResponse.json({ data: { doNow, followUp, newDMs } });
}
