import { requireRole } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAGE_ORDER } from "@/lib/stageConfig";
import { OverviewClient } from "./OverviewClient";
import type { LeadStage } from "@/types";

async function getOverviewData() {
  const db = createAdminClient();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 86400_000).toISOString();

  const [
    { data: leads },
    { data: events },
    { data: sessions },
    { data: members },
    { data: velocityEvents },
  ] = await Promise.all([
    db.from("salon_leads").select("id, sales_stage, assigned_to, updated_at"),
    db.from("outreach_events")
      .select("id, lead_id, type, metadata, created_by, created_at")
      .gte("created_at", weekAgo),
    db.from("demo_sessions")
      .select("lead_id, pct_reached, started_at")
      .gte("started_at", weekAgo),
    db.from("profiles")
      .select("id, full_name, email, role")
      .in("role", ["admin", "outreacher"])
      .eq("is_active", true),
    db.from("outreach_events")
      .select("lead_id, metadata, created_at")
      .gte("created_at", monthAgo)
      .eq("type", "status_changed"),
  ]);

  const allLeads = leads ?? [];
  const allEvents = events ?? [];
  const allSessions = sessions ?? [];
  const allMembers = members ?? [];
  const velEvents = velocityEvents ?? [];

  // ── Pipeline cards ────────────────────────────────────────────────────────
  const activeLeads = allLeads.filter(
    (l) => !["converted", "churned", "ghosted"].includes(l.sales_stage ?? "ready"),
  ).length;
  const hotNow = allLeads.filter((l) => l.sales_stage === "hot").length;
  const convertedThisMonth = allLeads.filter(
    (l) => l.sales_stage === "converted" && l.updated_at && new Date(l.updated_at) >= new Date(monthAgo),
  ).length;
  const trialTotal = allLeads.filter((l) => ["trial", "converted"].includes(l.sales_stage ?? "")).length;
  const convertedTotal = allLeads.filter((l) => l.sales_stage === "converted").length;
  const trialConvertedRate = trialTotal > 0 ? Math.round((convertedTotal / trialTotal) * 100) : 0;
  const dmsSentThisWeek = allEvents.filter((e) => (e.metadata as any)?.sales_stage === "sent").length;
  const viewsThisWeek = allSessions.length;
  const sentOrBeyond = allLeads.filter((l) =>
    ["sent","viewed","hot","replied","signedup","onboarding","trial","converted"].includes(l.sales_stage ?? ""),
  ).length;
  const viewedOrBeyond = allLeads.filter((l) =>
    ["viewed","hot","replied","signedup","onboarding","trial","converted"].includes(l.sales_stage ?? ""),
  ).length;
  const viewRate = sentOrBeyond > 0 ? Math.round((viewedOrBeyond / sentOrBeyond) * 100) : 0;
  const avgDemoPct = allSessions.length > 0
    ? Math.round(allSessions.reduce((s, r) => s + (r.pct_reached ?? 0), 0) / allSessions.length)
    : 0;

  // ── Funnel ────────────────────────────────────────────────────────────────
  const stageCounts = new Map<string, number>();
  for (const l of allLeads) stageCounts.set(l.sales_stage ?? "ready", (stageCounts.get(l.sales_stage ?? "ready") ?? 0) + 1);
  const funnel = STAGE_ORDER.map((stage) => ({ stage, count: stageCounts.get(stage) ?? 0 }));

  // ── Velocity ──────────────────────────────────────────────────────────────
  function avgDays(from: string, to: string): number | null {
    const map = new Map<string, { from?: string; to?: string }>();
    for (const e of velEvents) {
      const s = (e.metadata as any)?.sales_stage;
      if (!s) continue;
      const rec = map.get(e.lead_id) ?? {};
      if (s === from) rec.from = e.created_at;
      if (s === to && rec.from) rec.to = e.created_at;
      map.set(e.lead_id, rec);
    }
    const diffs: number[] = [];
    for (const { from: f, to: t } of map.values()) {
      if (f && t && t > f) diffs.push((new Date(t).getTime() - new Date(f).getTime()) / 86400_000);
    }
    return diffs.length > 0 ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length * 10) / 10 : null;
  }
  const velocity = {
    sentToViewed: avgDays("sent", "viewed"),
    viewedToReplied: avgDays("viewed", "replied"),
    repliedToSignedup: avgDays("replied", "signedup"),
  };

  // ── Trend (7 days) ────────────────────────────────────────────────────────
  const trend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toISOString().slice(0, 10);
    return {
      date: dayStr,
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      dmsSent: allEvents.filter((e) => (e.metadata as any)?.sales_stage === "sent" && e.created_at.slice(0, 10) === dayStr).length,
      views: allSessions.filter((s) => s.started_at.slice(0, 10) === dayStr).length,
      conversions: allLeads.filter((l) => l.sales_stage === "converted" && (l.updated_at ?? "").slice(0, 10) === dayStr).length,
    };
  });

  // ── Alerts ────────────────────────────────────────────────────────────────
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000);
  const oneDayAgo    = new Date(now.getTime() - 86400_000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400_000);
  const alerts = {
    stuckLeads: allLeads.filter((l) =>
      !["converted","churned","ghosted"].includes(l.sales_stage ?? "ready") &&
      l.updated_at && new Date(l.updated_at) < sevenDaysAgo,
    ).length,
    hotUncontacted: allLeads.filter((l) =>
      l.sales_stage === "hot" && l.updated_at && new Date(l.updated_at) < oneDayAgo,
    ).length,
    trialOverdue: allLeads.filter((l) =>
      l.sales_stage === "trial" && l.updated_at && new Date(l.updated_at) < threeDaysAgo,
    ).length,
  };

  // ── Team ──────────────────────────────────────────────────────────────────
  const members_ = allMembers.map((m) => {
    const mine = allLeads.filter((l) => l.assigned_to === m.id);
    const ghosted = mine.filter((l) => l.sales_stage === "ghosted").length;
    return {
      id: m.id,
      name: m.full_name ?? m.email,
      email: m.email,
      assigned: mine.length,
      active: mine.filter((l) => !["converted","churned","ghosted"].includes(l.sales_stage ?? "ready")).length,
      dmsSentThisWeek: allEvents.filter((e) => e.created_by === m.id && (e.metadata as any)?.sales_stage === "sent").length,
      viewsThisWeek: allSessions.filter((s) => mine.some((l) => l.id === s.lead_id)).length,
      converted: mine.filter((l) => l.sales_stage === "converted").length,
      ghostedPct: mine.length > 0 ? Math.round((ghosted / mine.length) * 100) : 0,
    };
  });

  return {
    pipeline: { activeLeads, hotNow, dmsSentThisWeek, viewsThisWeek, viewRate, convertedThisMonth, trialConvertedRate, avgDemoPct, funnel, velocity, trend, alerts },
    team: { activeOutreachers: allMembers.length, teamDmsThisWeek: dmsSentThisWeek, members: members_ },
  };
}

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  await requireRole("admin");
  const data = await getOverviewData();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Overview</h1>
        <p className="text-sm text-muted">Pipeline health and team performance.</p>
      </div>
      <OverviewClient pipeline={data.pipeline} team={data.team} />
    </div>
  );
}
