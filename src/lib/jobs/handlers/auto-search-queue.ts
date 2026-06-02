import {
  generateGridPoints,
  getGridConfig,
  RESCRAPE_INTERVAL_DAYS,
  SEARCH_JOB_STAGGER_MS,
  SEARCH_TARGETS,
  SERPER_MAX_PAGES,
  SERPER_MAX_RESULTS_PER_CALL,
  USE_QUERY_VARIATIONS,
  VERTICAL_QUERIES,
} from "@/lib/config/search-targets";
import { enqueueJob } from "@/lib/jobs/queue";
import { createAdminClient } from "@/lib/supabase/admin";

export type AutoSearchQueueResult = {
  queued: number;
  skipped: number;
  totalEstimatedCalls: number;
  log: string[];
};

export async function handleAutoSearchQueue(): Promise<AutoSearchQueueResult> {
  const adminClient = createAdminClient();
  const log: string[] = [];
  let queued = 0;
  let skipped = 0;
  let totalEstimatedCalls = 0;

  const enabledTargets = SEARCH_TARGETS.filter((target) => target.enabled).sort((a, b) => a.priority - b.priority);

  for (const target of enabledTargets) {
    const targetKey = `${target.city} ${target.state} ${target.vertical}`;

    const { data: lastRun } = await adminClient
      .from("lead_search_runs")
      .select("id, created_at, total_imported")
      .eq("city", target.city)
      .eq("state", target.state)
      .eq("vertical", target.vertical)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; created_at: string; total_imported: number | null }>();

    if (lastRun) {
      const daysSince = (Date.now() - new Date(lastRun.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < RESCRAPE_INTERVAL_DAYS) {
        const daysLeft = Math.ceil(RESCRAPE_INTERVAL_DAYS - daysSince);
        log.push(`SKIP ${targetKey}: searched ${Math.floor(daysSince)}d ago, next in ${daysLeft}d`);
        skipped += 1;
        continue;
      }
    }

    const { data: pendingRun } = await adminClient
      .from("lead_search_runs")
      .select("id")
      .eq("city", target.city)
      .eq("state", target.state)
      .eq("vertical", target.vertical)
      .in("status", ["pending", "running"])
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (pendingRun) {
      log.push(`SKIP ${targetKey}: already pending/running`);
      skipped += 1;
      continue;
    }

    const queries = USE_QUERY_VARIATIONS
      ? VERTICAL_QUERIES[target.vertical] ?? [target.vertical]
      : [VERTICAL_QUERIES[target.vertical]?.[0] ?? target.vertical];
    const gridPoints = generateGridPoints(getGridConfig(target.city, target.state));
    let queuedForTarget = 0;

    for (const [queryIdx, query] of queries.entries()) {
      for (const [gridIdx, gridPoint] of gridPoints.entries()) {
        const { data: searchRun, error } = await adminClient
          .from("lead_search_runs")
          .insert({
            query,
            city: target.city,
            state: target.state,
            country: "US",
            provider: "serper",
            max_results: SERPER_MAX_RESULTS_PER_CALL * SERPER_MAX_PAGES,
            status: "pending",
            vertical: target.vertical,
            grid_point: gridPoint.llParam || null,
            grid_index: gridIdx,
            grid_total: gridPoints.length,
            query_variation: query,
            created_by: null,
          })
          .select("id")
          .single<{ id: string }>();

        if (error || !searchRun) {
          log.push(`SKIP ${targetKey}: failed to create search run (${error?.message ?? "unknown"})`);
          skipped += 1;
          continue;
        }

        const staggerMs = (queued + queuedForTarget) * SEARCH_JOB_STAGGER_MS;
        await enqueueJob(
          "search_run",
          {
            searchRunId: searchRun.id,
            vertical: target.vertical,
            gridPoint: gridPoint.llParam,
            gridIndex: gridIdx,
            gridTotal: gridPoints.length,
            queryVariation: query,
            queryVariationIndex: queryIdx,
          },
          { runAt: new Date(Date.now() + staggerMs) },
        );

        queuedForTarget += 1;
        totalEstimatedCalls += SERPER_MAX_PAGES;
      }
    }

    log.push(`QUEUE ${targetKey}: ${queuedForTarget} jobs, ~${queuedForTarget * SERPER_MAX_PAGES} Serper calls`);
    queued += queuedForTarget;
  }

  const summary = `AutoSearchQueue: ${queued} jobs queued, ${skipped} targets skipped, ~${totalEstimatedCalls} Serper calls estimated`;
  console.log(`[AutoSearchQueue] ${summary}`);
  for (const entry of log) console.log(`[AutoSearchQueue] ${entry}`);

  return { queued, skipped, totalEstimatedCalls, log };
}
