/**
 * GET /api/overview
 * Admin-only. Returns all stats for the Overview dashboard in one round-trip.
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAGE_ORDER } from "@/lib/stageConfig";
import type { LeadStage } from "@/types";

export async function GET() {
  await requireRole("admin");
  const db = createAdminClient();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 86400_000).toISOString();

  const [
    { data: leads },
    { data: events },
    { data: sessions },
    { data: members },
    { data: memberEvents },
  ] = await Promise.all([
    // All leads with sales_stage
    db.from("salon_leads").select("id, sales_stage, assigned_to, updated_at"),

    // Outreach events for trend + velocity
    db.from("outreach_events")
      .select("id, lead_id, type, notes, metadata, created_by, created_at")
      .gte("created_at", weekAgo),

    // Demo sessions this week
    db.from("demo_sessions")
      .select("lead_id, pct_reached, started_at")
      .gte("started_at", weekAgo),

    // Team members
    db.from("profiles")
      .select("id, full_name, email, role")
      .in("role", ["admin", "outreacher"])
      .eq("is_active", true),

    // All outreach events for velocity (30 days)
    db.from("outreach_events")
      .select("lead_id, metadata, created_at")
      .gte("created_at", monthAgo)
      .eq("type", "status_changed"),
  ]);

  const allLeads = leads ?? [];
  const allEvents = events ?? [];
  const allSessions = sessions ?? [];
  const allMembers = members ?? [];
  const velocityEvents = memberEvents ?? [];

  // ── Pipeline ──────────────────────────────────────────────────────────────

  const activeLeads = allLeads.filter(
    (l) => !["converted", "churned", "ghosted"].includes(l.sales_stage ?? "ready"),
  ).length;

  const hotNow = allLeads.filter((l) => l.sales_stage === "hot").length;

  const convertedThisMonth = allLeads.filter(
    (l) => l.sales_stage === "converted"
      && l.updated_at && new Date(l.updated_at) >= new Date(monthAgo),
  ).length;

  const trialLeads = allLeads.filter((l) => l.sales_stage === "trial").length;
  const convertedLeads = allLeads.filter((l) => l.sales_stage === "converted").length;
  const trialConvertedRate = trialLeads + convertedLeads > 0
    ? Math.round((convertedLeads / (trialLeads + convertedLeads)) * 100)
    : 0;

  // DMs sent this week = stage_changed → "sent" events
  const dmsSentThisWeek = allEvents.filter(
    (e) => (e.metadata as any)?.sales_stage === "sent",
  ).length;

  // Views this week = demo sessions
  const viewsThisWeek = allSessions.length;

  // View rate = leads that moved past sent / leads that were sent
  const sentOrBeyond = allLeads.filter((l) => {
    const s = l.sales_stage as LeadStage;
    return ["sent","viewed","hot","replied","signedup","onboarding","trial","converted"].includes(s);
  }).length;
  const viewedOrBeyond = allLeads.filter((l) => {
    const s = l.sales_stage as LeadStage;
    return ["viewed","hot","replied","signedup","onboarding","trial","converted"].includes(s);
  }).length;
  const viewRate = sentOrBeyond > 0 ? Math.round((viewedOrBeyond / sentOrBeyond) * 100) : 0;

  // Avg demo watched %
  const avgDemoPct = allSessions.length > 0
    ? Math.round(allSessions.reduce((s, r) => s + (r.pct_reached ?? 0), 0) / allSessions.length)
    : 0;

  // Funnel: count per stage
  const stageCounts = new Map<string, number>();
  for (const l of allLeads) {
    const s = l.sales_stage ?? "ready";
    stageCounts.set(s, (stageCounts.get(s) ?? 0) + 1);
  }
  const funnel = STAGE_ORDER.map((stage) => ({
    stage,
    count: stageCounts.get(stage) ?? 0,
  }));

  // Velocity: avg days between stage transitions (30-day window)
  function avgDaysBetween(fromStage: string, toStage: string): number | null {
    const byLead = new Map<string, { from?: string; to?: string }>();
    for (const e of velocityEvents) {
      const s = (e.metadata as any)?.sales_stage;
      if (!s) continue;
      const rec = byLead.get(e.lead_id) ?? {};
      if (s === fromStage) rec.from = e.created_at;
      if (s === toStage && rec.from) rec.to = e.created_at;
      byLead.set(e.lead_id, rec);
    }
    const diffs: number[] = [];
    for (const { from, to } of byLead.values()) {
      if (from && to && to > from) {
        diffs.push((new Date(to).getTime() - new Date(from).getTime()) / 86400_000);
      }
    }
    return diffs.length > 0
      ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length * 10) / 10
      : null;
  }

  const velocity = {
    sentToViewed:    avgDaysBetween("sent", "viewed"),
    viewedToReplied: avgDaysBetween("viewed", "replied"),
    repliedToSignedup: avgDaysBetween("replied", "signedup"),
  };

  // Trend: last 7 days (DMs sent + views + conversions per day)
  const trend: Array<{ date: string; label: string; dmsSent: number; views: number; conversions: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    trend.push({
      date: dayStr,
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      dmsSent: allEvents.filter(
        (e) => (e.metadata as any)?.sales_stage === "sent" && e.created_at.slice(0, 10) === dayStr,
      ).length,
      views: allSessions.filter((s) => s.started_at.slice(0, 10) === dayStr).length,
      conversions: allLeads.filter(
        (l) => l.sales_stage === "converted" && (l.updated_at ?? "").slice(0, 10) === dayStr,
      ).length,
    });
  }

  // Alerts
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000);
  const oneDayAgo = new Date(now.getTime() - 86400_000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400_000);

  const stuckLeads = allLeads.filter((l) => {
    const s = l.sales_stage as LeadStage;
    if (["converted", "churned", "ghosted"].includes(s)) return false;
    return l.updated_at && new Date(l.updated_at) < sevenDaysAgo;
  }).length;

  const hotUncontacted = allLeads.filter((l) => {
    if (l.sales_stage !== "hot") return false;
    return l.updated_at && new Date(l.updated_at) < oneDayAgo;
  }).length;

  const trialOverdue = allLeads.filter((l) => {
    if (l.sales_stage !== "trial") return false;
    return l.updated_at && new Date(l.updated_at) < threeDaysAgo;
  }).length;

  // ── Team ──────────────────────────────────────────────────────────────────

  const activeOutreachers = allMembers.length;

  const teamDmsThisWeek = dmsSentThisWeek;

  const memberRows = allMembers.map((m) => {
    const assignedLeads = allLeads.filter((l) => l.assigned_to === m.id);
    const assigned = assignedLeads.length;
    const active = assignedLeads.filter(
      (l) => !["converted","churned","ghosted"].includes(l.sales_stage ?? "ready"),
    ).length;
    const converted = assignedLeads.filter((l) => l.sales_stage === "converted").length;
    const ghosted = assignedLeads.filter((l) => l.sales_stage === "ghosted").length;
    const ghostedPct = assigned > 0 ? Math.round((ghosted / assigned) * 100) : 0;

    const dmsSentWk = allEvents.filter(
      (e) => e.created_by === m.id && (e.metadata as any)?.sales_stage === "sent",
    ).length;

    const viewsWk = allSessions.filter((s) => {
      const lead = allLeads.find((l) => l.id === s.lead_id);
      return lead?.assigned_to === m.id;
    }).length;

    return {
      id: m.id,
      name: m.full_name ?? m.email,
      email: m.email,
      assigned,
      active,
      dmsSentThisWeek: dmsSentWk,
      viewsThisWeek: viewsWk,
      converted,
      ghostedPct,
    };
  });

  return NextResponse.json({
    data: {
      pipeline: {
        activeLeads,
        hotNow,
        dmsSentThisWeek,
        viewsThisWeek,
        viewRate,
        convertedThisMonth,
        trialConvertedRate,
        avgDemoPct,
        funnel,
        velocity,
        trend,
        alerts: { stuckLeads, hotUncontacted, trialOverdue },
      },
      team: {
        activeOutreachers,
        teamDmsThisWeek,
        members: memberRows,
      },
    },
  });
}
