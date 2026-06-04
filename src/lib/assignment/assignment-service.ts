/**
 * Auto lead-assignment engine.
 *
 * Daily cycle:
 *  1. Reclaim untouched leads (sales_stage 'ready') from now-inactive reps → back to pool.
 *  2. Build the assignable pool (unassigned · has_social · scored · vertical match · stage ready),
 *     ordered by priority (P1→P3) then score desc.
 *  3. Distribute round-robin to active outreachers, each capped at max_per_day NEW leads/day.
 *
 * Pause is a dedicated flag (assignment_config.is_paused) — independent of the global worker pause.
 * Already-assigned leads are never reassigned; touched leads stay with a removed rep.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { createDemo } from "@/lib/demo/demo-service";
import type { AssignmentConfig, AssignmentPoolStats, AssignmentPriorityMode, SalonLead } from "@/types";

type Db = ReturnType<typeof createAdminClient>;

function prioritiesForMode(mode: AssignmentPriorityMode): number[] {
  switch (mode) {
    case "p1_only": return [1];
    case "p2_only": return [2];
    case "p3_only": return [3];
    case "waterfall": return [1, 2, 3];
  }
}

function startOfUtcDay(d = new Date()): string {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString();
}

export async function getAssignmentConfig(db: Db = createAdminClient()): Promise<AssignmentConfig> {
  const { data } = await db
    .from("assignment_config")
    .select("*")
    .eq("id", true)
    .maybeSingle<AssignmentConfig>();
  return (
    data ?? {
      verticals: ["hair_salon", "nail_salon"],
      max_per_day: 20,
      priority_mode: "waterfall",
      is_paused: false,
      last_run_at: null,
      last_run_assigned: 0,
      updated_by: null,
      updated_at: new Date().toISOString(),
    }
  );
}

type Candidate = { id: string; priority: number };

/**
 * Fetch assignable lead IDs for the given verticals + priorities, ordered P1→P3 then
 * score desc. Queried from lead_scores (base table) so the ORDER BY uses its own
 * columns — ordering a parent by an embedded to-many resource is unreliable in PostgREST.
 * The inner joins drop unassignable leads (assigned, no social, wrong stage/vertical).
 */
async function fetchPool(db: Db, verticals: string[], priorities: number[], limit: number): Promise<Candidate[]> {
  const { data, error } = await db
    .from("lead_scores")
    .select("lead_id, priority, score, salon_leads!inner(assigned_to, has_social, sales_stage, lead_search_runs!inner(vertical))")
    .in("priority", priorities)
    .is("salon_leads.assigned_to", null)
    .eq("salon_leads.has_social", true)
    .eq("salon_leads.sales_stage", "ready")
    .in("salon_leads.lead_search_runs.vertical", verticals)
    .order("priority", { ascending: true })
    .order("score", { ascending: false })
    .limit(limit * 2); // headroom for de-duping leads with multiple scoring versions

  if (error) throw new Error(`fetchPool failed: ${error.message}`);

  // De-dupe by lead_id (best score first wins, since ordered by priority/score).
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const row of data ?? []) {
    const id = row.lead_id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, priority: (row.priority as number) ?? 3 });
    if (out.length >= limit) break;
  }
  return out;
}

/** Keep only candidates whose lead has a 'prepared' (QA-passable) demo ready. */
async function filterToPreparedDemos(db: Db, candidates: Candidate[]): Promise<Candidate[]> {
  if (candidates.length === 0) return [];
  const ids = candidates.map((c) => c.id);
  const { data } = await db
    .from("ringbooker_demos")
    .select("lead_id")
    .eq("status", "prepared")
    .in("lead_id", ids);
  const ready = new Set((data ?? []).map((d) => d.lead_id as string));
  return candidates.filter((c) => ready.has(c.id));
}

/** Count of active outreachers (assignment capacity is reps × max_per_day). */
async function activeOutreacherCount(db: Db): Promise<number> {
  const { count } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "outreacher")
    .eq("is_active", true);
  return count ?? 0;
}

/** A lead has enough context to build a quality demo. */
function hasDemoQualityInputs(lead: Pick<SalonLead, "name" | "city" | "state" | "website_url" | "instagram_url">): boolean {
  return Boolean(lead.name && lead.city && lead.state && (lead.website_url || lead.instagram_url));
}

export type DemoTopUpResult = { created: number; failed: number; skipped: number };

/**
 * Pre-build demos for the leads that the next assignment cycle will hand out, so
 * the RingBooker demo API is hit while the US is asleep (not during enrichment,
 * not at assignment time). Tops up the top-of-pool leads up to the daily
 * capacity (active reps × max_per_day); creates at most `maxThisTick` per call so
 * the worker can spread the load across the nightly window.
 */
export async function topUpPoolDemos(db: Db = createAdminClient(), maxThisTick = 3): Promise<DemoTopUpResult> {
  const config = await getAssignmentConfig(db);
  if (config.is_paused) return { created: 0, failed: 0, skipped: 0 };

  const reps = await activeOutreacherCount(db);
  const capacity = reps * config.max_per_day;
  if (capacity === 0) return { created: 0, failed: 0, skipped: 0 };

  // Top `capacity` assignable leads (same ordering assignment uses).
  const pool = await fetchPool(db, config.verticals, prioritiesForMode(config.priority_mode), capacity);
  if (pool.length === 0) return { created: 0, failed: 0, skipped: 0 };

  // Which of them already have a demo (any status) — skip those.
  const ids = pool.map((p) => p.id);
  const { data: existing } = await db.from("ringbooker_demos").select("lead_id").in("lead_id", ids);
  const hasDemo = new Set((existing ?? []).map((d) => d.lead_id as string));
  const missing = pool.filter((p) => !hasDemo.has(p.id)).slice(0, maxThisTick);
  if (missing.length === 0) return { created: 0, failed: 0, skipped: 0 };

  // Input quality gate before spending a RingBooker API call.
  const { data: leadRows } = await db
    .from("salon_leads")
    .select("id, name, city, state, website_url, instagram_url")
    .in("id", missing.map((m) => m.id));
  const leadById = new Map((leadRows ?? []).map((l) => [l.id as string, l]));

  let created = 0;
  let failed = 0;
  let skipped = 0;
  for (const cand of missing) {
    const lead = leadById.get(cand.id) as Pick<SalonLead, "id" | "name" | "city" | "state" | "website_url" | "instagram_url"> | undefined;
    if (!lead || !hasDemoQualityInputs(lead)) { skipped += 1; continue; }
    try {
      const { demoId, demoUrl } = await createDemo(cand.id, null);
      if (!demoUrl) {
        await db.from("ringbooker_demos").update({ status: "failed" }).eq("id", demoId);
        failed += 1;
      } else {
        created += 1;
      }
    } catch {
      failed += 1; // API error — leave lead demo-less; retried on a later tick.
    }
  }
  return { created, failed, skipped };
}

/** Active outreachers and how many more leads each can take today (flow cap). */
async function repCapacities(db: Db, maxPerDay: number): Promise<Array<{ id: string; remaining: number }>> {
  const { data: reps } = await db
    .from("profiles")
    .select("id")
    .eq("role", "outreacher")
    .eq("is_active", true);

  if (!reps?.length) return [];

  const today = startOfUtcDay();
  const result: Array<{ id: string; remaining: number }> = [];
  for (const rep of reps) {
    const { count } = await db
      .from("salon_leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", rep.id)
      .gte("assigned_at", today);
    const remaining = Math.max(0, maxPerDay - (count ?? 0));
    if (remaining > 0) result.push({ id: rep.id, remaining });
  }
  return result;
}

export type AssignmentResult = {
  status: "completed" | "paused" | "no_reps" | "empty_pool";
  assigned: number;
  reclaimed: number;
  perRep: Record<string, number>;
};

export async function runAssignmentCycle(db: Db = createAdminClient()): Promise<AssignmentResult> {
  const config = await getAssignmentConfig(db);
  if (config.is_paused) return { status: "paused", assigned: 0, reclaimed: 0, perRep: {} };

  // 1. Reclaim untouched leads from inactive reps → back to pool.
  const { data: inactive } = await db.from("profiles").select("id").eq("is_active", false);
  const inactiveIds = (inactive ?? []).map((p) => p.id);
  let reclaimed = 0;
  if (inactiveIds.length > 0) {
    const { data: reclaimedRows } = await db
      .from("salon_leads")
      .update({ assigned_to: null, assigned_at: null })
      .in("assigned_to", inactiveIds)
      .eq("sales_stage", "ready")
      .select("id");
    reclaimed = reclaimedRows?.length ?? 0;
  }

  // 2. Capacity per active rep.
  const caps = await repCapacities(db, config.max_per_day);
  if (caps.length === 0) {
    await db.from("assignment_config").update({ last_run_at: new Date().toISOString(), last_run_assigned: 0 }).eq("id", true);
    return { status: "no_reps", assigned: 0, reclaimed, perRep: {} };
  }

  const totalCapacity = caps.reduce((s, r) => s + r.remaining, 0);

  // 3. Pool (ordered P1→P3 then score), capped to total capacity to limit work.
  //    Only leads that already have a 'prepared' demo are assignable — demos are
  //    built the night before (topUpPoolDemos), so a rep never gets a lead with no
  //    (or a broken) demo to send.
  const rawPool = await fetchPool(db, config.verticals, prioritiesForMode(config.priority_mode), totalCapacity);
  const pool = await filterToPreparedDemos(db, rawPool);
  if (pool.length === 0) {
    await db.from("assignment_config").update({ last_run_at: new Date().toISOString(), last_run_assigned: 0 }).eq("id", true);
    return { status: "empty_pool", assigned: 0, reclaimed, perRep: {} };
  }

  // 4. Round-robin distribution honoring per-rep remaining capacity. Pool already in
  //    priority order, so waterfall (P1 first) falls out naturally.
  const perRep: Record<string, number> = {};
  const now = new Date().toISOString();
  let cursor = 0;
  let assigned = 0;

  for (const cand of pool) {
    // Find next rep (from cursor) with remaining capacity.
    let placed = false;
    for (let i = 0; i < caps.length; i += 1) {
      const rep = caps[(cursor + i) % caps.length];
      if (rep.remaining > 0) {
        const { error } = await db
          .from("salon_leads")
          .update({ assigned_to: rep.id, assigned_at: now })
          .eq("id", cand.id)
          .is("assigned_to", null); // guard against concurrent run double-assigning
        if (!error) {
          rep.remaining -= 1;
          perRep[rep.id] = (perRep[rep.id] ?? 0) + 1;
          assigned += 1;
          cursor = (cursor + i + 1) % caps.length;
          await db.from("outreach_events").insert({
            lead_id: cand.id,
            type: "assigned",
            notes: "Auto-assigned",
            metadata: { assigned_to: rep.id, auto: true, priority: cand.priority },
            created_by: null,
          });
        }
        placed = true;
        break;
      }
    }
    if (!placed) break; // all reps full
  }

  await db.from("assignment_config").update({ last_run_at: now, last_run_assigned: assigned }).eq("id", true);
  return { status: "completed", assigned, reclaimed, perRep };
}

export async function getPoolStats(db: Db = createAdminClient()): Promise<AssignmentPoolStats> {
  const config = await getAssignmentConfig(db);

  async function countPriority(priority: number): Promise<number> {
    const { count } = await db
      .from("salon_leads")
      .select("id, lead_scores!inner(priority), lead_search_runs!inner(vertical)", { count: "exact", head: true })
      .is("assigned_to", null)
      .eq("has_social", true)
      .eq("sales_stage", "ready")
      .in("lead_search_runs.vertical", config.verticals)
      .eq("lead_scores.priority", priority);
    return count ?? 0;
  }

  const [p1, p2, p3] = await Promise.all([countPriority(1), countPriority(2), countPriority(3)]);
  const total = p1 + p2 + p3;

  const { count: repCount } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "outreacher")
    .eq("is_active", true);
  const activeReps = repCount ?? 0;

  const dailyDemand = activeReps * config.max_per_day;

  // Runway uses only the pool the current mode actually consumes.
  const usablePool =
    config.priority_mode === "p1_only" ? p1 :
    config.priority_mode === "p2_only" ? p2 :
    config.priority_mode === "p3_only" ? p3 :
    total;
  const runwayDays = dailyDemand > 0 ? Math.floor(usablePool / dailyDemand) : null;

  return {
    pool: { p1, p2, p3, total },
    activeReps,
    maxPerDay: config.max_per_day,
    priorityMode: config.priority_mode,
    dailyDemand,
    runwayDays,
    isPaused: config.is_paused,
    lastRunAt: config.last_run_at,
    lastRunAssigned: config.last_run_assigned,
  };
}
