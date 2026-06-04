import { requireRole } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAGE_ORDER } from "@/lib/stageConfig";
import { OverviewClient } from "./OverviewClient";

type Db = ReturnType<typeof createAdminClient>;

const ACTIVE_STAGES = ["ready", "sent", "viewed", "hot", "replied", "signedup", "onboarding", "trial"];
const IN_PROGRESS_STAGES = ["sent", "viewed", "hot", "replied", "signedup", "onboarding", "trial"];
const SENT_OR_BEYOND = ["sent", "viewed", "hot", "replied", "signedup", "onboarding", "trial", "converted"];
const VIEWED_OR_BEYOND = ["viewed", "hot", "replied", "signedup", "onboarding", "trial", "converted"];

async function getOverviewData() {
  const db = createAdminClient();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 86400_000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 86400_000).toISOString();
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400_000).toISOString();

  // Whole-table per-stage counts (not capped at Supabase's 1000-row fetch limit).
  const { data: stageRows } = await db.rpc("get_sales_stage_counts", { p_assigned_to: null });
  const byStage: Record<string, number> = {};
  for (const row of (stageRows ?? []) as Array<{ stage: string; n: number }>) byStage[row.stage] = Number(row.n);
  const get = (s: string) => byStage[s] ?? 0;
  const total = Object.values(byStage).reduce((a, b) => a + b, 0);

  // ── Pipeline cards (from stage counts) ──────────────────────────────────────
  const activeLeads = ACTIVE_STAGES.reduce((a, s) => a + get(s), 0);
  const hotNow = get("hot");
  const trialConvertedRate =
    get("trial") + get("converted") > 0 ? Math.round((get("converted") / (get("trial") + get("converted"))) * 100) : 0;
  const sentOrBeyond = SENT_OR_BEYOND.reduce((a, s) => a + get(s), 0);
  const viewedOrBeyond = VIEWED_OR_BEYOND.reduce((a, s) => a + get(s), 0);
  const viewRate = sentOrBeyond > 0 ? Math.round((viewedOrBeyond / sentOrBeyond) * 100) : 0;
  const funnel = STAGE_ORDER.map((stage) => ({ stage, count: get(stage) }));
  const inProgress = IN_PROGRESS_STAGES.reduce((a, s) => a + get(s), 0);
  const readyTotal = get("ready");

  // Assignable pool by priority: ready · has_social · unassigned · scored.
  const [poolP1, poolP2, poolP3] = await Promise.all([
    countReadyAssignable(db, 1),
    countReadyAssignable(db, 2),
    countReadyAssignable(db, 3),
  ]);
  const inventory = {
    inProgress,
    readyTotal,
    pool: { p1: poolP1, p2: poolP2, p3: poolP3, total: poolP1 + poolP2 + poolP3 },
  };

  // ── Time-bounded counts (exact, via head-count queries) ─────────────────────
  const [
    convertedThisMonth,
    dmsSentThisWeek,
    viewsThisWeek,
    stuckLeads,
    hotUncontacted,
    trialOverdue,
    { data: weekSessions },
    { data: velEvents },
  ] = await Promise.all([
    countLeads(db, (q) => q.eq("sales_stage", "converted").gte("updated_at", monthAgo)),
    countEvents(db, (q) => q.eq("metadata->>sales_stage", "sent").gte("created_at", weekAgo)),
    countSessions(db, (q) => q.gte("started_at", weekAgo)),
    countLeads(db, (q) => q.in("sales_stage", ACTIVE_STAGES).lt("updated_at", sevenDaysAgo)),
    countLeads(db, (q) => q.eq("sales_stage", "hot").lt("updated_at", oneDayAgo)),
    countLeads(db, (q) => q.eq("sales_stage", "trial").lt("updated_at", threeDaysAgo)),
    db.from("demo_sessions").select("pct_reached, started_at").gte("started_at", weekAgo),
    db.from("outreach_events").select("lead_id, metadata, created_at").gte("created_at", monthAgo).eq("type", "status_changed"),
  ]);

  const sessions = weekSessions ?? [];
  const avgDemoPct = sessions.length > 0
    ? Math.round(sessions.reduce((s, r) => s + (r.pct_reached ?? 0), 0) / sessions.length)
    : 0;

  const alerts = { stuckLeads, hotUncontacted, trialOverdue };

  // ── Velocity (avg days between stage transitions, 30d sample) ───────────────
  function avgDays(from: string, to: string): number | null {
    const map = new Map<string, { from?: string; to?: string }>();
    for (const e of velEvents ?? []) {
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
    return diffs.length > 0 ? Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10 : null;
  }
  const velocity = {
    sentToViewed: avgDays("sent", "viewed"),
    viewedToReplied: avgDays("viewed", "replied"),
    repliedToSignedup: avgDays("replied", "signedup"),
  };

  // ── Trend (7 days, exact per-day counts) ────────────────────────────────────
  const trend = await Promise.all(
    Array.from({ length: 7 }, async (_, i) => {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (6 - i));
      const start = d.toISOString();
      const end = new Date(d.getTime() + 86400_000).toISOString();
      const [dmsSent, views, conversions] = await Promise.all([
        countEvents(db, (q) => q.eq("metadata->>sales_stage", "sent").gte("created_at", start).lt("created_at", end)),
        countSessions(db, (q) => q.gte("started_at", start).lt("started_at", end)),
        countLeads(db, (q) => q.eq("sales_stage", "converted").gte("updated_at", start).lt("updated_at", end)),
      ]);
      return { date: start.slice(0, 10), label: d.toLocaleDateString("en-US", { weekday: "short" }), dmsSent, views, conversions };
    }),
  );

  // ── Team (per-rep exact counts) ─────────────────────────────────────────────
  const { data: members } = await db
    .from("profiles")
    .select("id, full_name, email")
    .in("role", ["admin", "outreacher"])
    .eq("is_active", true);

  const membersList = await Promise.all(
    (members ?? []).map(async (m) => {
      const [assigned, active, converted, ghosted, dmsSent, views] = await Promise.all([
        countLeads(db, (q) => q.eq("assigned_to", m.id)),
        countLeads(db, (q) => q.eq("assigned_to", m.id).in("sales_stage", ACTIVE_STAGES)),
        countLeads(db, (q) => q.eq("assigned_to", m.id).eq("sales_stage", "converted")),
        countLeads(db, (q) => q.eq("assigned_to", m.id).eq("sales_stage", "ghosted")),
        countEvents(db, (q) => q.eq("created_by", m.id).eq("metadata->>sales_stage", "sent").gte("created_at", weekAgo)),
        db.from("demo_sessions")
          .select("id, salon_leads!inner(assigned_to)", { count: "exact", head: true })
          .eq("salon_leads.assigned_to", m.id)
          .gte("started_at", weekAgo)
          .then((r) => r.count ?? 0),
      ]);
      return {
        id: m.id,
        name: m.full_name ?? m.email,
        email: m.email,
        assigned,
        active,
        dmsSentThisWeek: dmsSent,
        viewsThisWeek: views,
        converted,
        ghostedPct: assigned > 0 ? Math.round((ghosted / assigned) * 100) : 0,
      };
    }),
  );

  return {
    pipeline: { activeLeads, hotNow, dmsSentThisWeek, viewsThisWeek, viewRate, convertedThisMonth, trialConvertedRate, avgDemoPct, funnel, velocity, trend, alerts, inventory },
    team: { activeOutreachers: membersList.length, teamDmsThisWeek: dmsSentThisWeek, members: membersList },
  };
}

// Count ready leads that are actually assignable (has social, unassigned) for a priority.
async function countReadyAssignable(db: Db, priority: number): Promise<number> {
  const { count } = await db
    .from("salon_leads")
    .select("id, lead_scores!inner(priority)", { count: "exact", head: true })
    .is("assigned_to", null)
    .eq("has_social", true)
    .eq("sales_stage", "ready")
    .eq("lead_scores.priority", priority);
  return count ?? 0;
}

// Head-count helpers — return exact row counts without fetching rows (no 1000-row cap).
function countLeads(db: Db, build: (q: any) => any): Promise<number> {
  return build(db.from("salon_leads").select("id", { count: "exact", head: true })).then((r: any) => r.count ?? 0);
}
function countEvents(db: Db, build: (q: any) => any): Promise<number> {
  return build(db.from("outreach_events").select("id", { count: "exact", head: true })).then((r: any) => r.count ?? 0);
}
function countSessions(db: Db, build: (q: any) => any): Promise<number> {
  return build(db.from("demo_sessions").select("id", { count: "exact", head: true })).then((r: any) => r.count ?? 0);
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
