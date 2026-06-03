import "dotenv/config";
import { env } from "../src/lib/env";
import { dispatchJob } from "../src/lib/jobs/dispatch";
import { claimNextJob, completeJob, enqueueJob, failJob, releaseStaleJobs } from "../src/lib/jobs/queue";
import { runAssignmentCycle } from "../src/lib/assignment/assignment-service";
import { createAdminClient } from "../src/lib/supabase/admin";

let shuttingDown = false;
const workerId = env.workerId;
const pollIntervalMs = Number.isFinite(env.workerPollIntervalMs) ? env.workerPollIntervalMs : 2000;
// How many jobs to process concurrently. SKIP LOCKED makes parallel claims safe.
const concurrency = Math.min(10, Math.max(1, Number.isFinite(env.workerConcurrency) ? env.workerConcurrency : 3));

let lastAutoQueueRun = 0;
const AUTO_QUEUE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AUTO_QUEUE_HOUR_UTC = 2;
let lastInstagramBatchRun = 0;
const INSTAGRAM_BATCH_INTERVAL_MS = 60 * 60 * 1000;
let isPaused = false;
const MAINTENANCE_INTERVAL_MS = 5_000;

process.on("SIGINT", () => { shuttingDown = true; });
process.on("SIGTERM", () => { shuttingDown = true; });

console.log(`[Worker] Starting ${workerId}`);
console.log(`[Worker] Concurrency: ${concurrency} lanes · poll ${pollIntervalMs}ms`);

// Run the maintenance loop + N worker lanes in parallel
await Promise.all([
  maintenanceLoop(),
  ...Array.from({ length: concurrency }, (_, i) => workerLane(i + 1)),
]);

console.log("[Worker] Shutdown complete");

// ── Worker lane: claims and processes one job at a time, independently ──
async function workerLane(laneId: number) {
  const laneWorkerId = `${workerId}#${laneId}`;
  while (!shuttingDown) {
    try {
      if (isPaused) {
        await sleep(pollIntervalMs);
        continue;
      }

      const job = await claimNextJob(laneWorkerId);
      if (!job) {
        await sleep(pollIntervalMs);
        continue;
      }

      if ((job as any).status === "cancelled") {
        console.log(`[Lane ${laneId}] Job ${job.id} cancelled, skipping`);
        continue;
      }

      try {
        await dispatchJob(job);
        await completeJob(job.id, { completedAt: new Date().toISOString(), lane: laneId });
      } catch (error) {
        await failJob(job, error);
        console.error(`[Lane ${laneId}] Job ${job.id} (${job.type}) failed:`, error instanceof Error ? error.message : error);
      }
    } catch (error) {
      // Claim/connection error — back off and retry, don't kill the lane
      console.error(`[Lane ${laneId}] tick failed`, error);
      await sleep(pollIntervalMs);
    }
  }
}

// ── Maintenance loop: runs once (not per-lane) for periodic + control tasks ──
async function maintenanceLoop() {
  while (!shuttingDown) {
    try {
      await refreshPausedState();
      if (!isPaused) {
        await releaseStaleJobs(15);
        await maybeEnqueueDailyAutoSearch();
        await maybeEnqueueInstagramBatch();
        await maybeRunDailyAssignment();
      }
    } catch (error) {
      console.error("[Maintenance] tick failed", error);
    }
    await sleep(MAINTENANCE_INTERVAL_MS);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshPausedState() {
  try {
    const { data } = await createAdminClient()
      .from("worker_settings")
      .select("is_paused")
      .eq("id", true)
      .single<{ is_paused: boolean }>();

    const wasPaused = isPaused;
    isPaused = data?.is_paused ?? false;

    if (isPaused && !wasPaused) console.log("[Worker] Paused via admin");
    if (!isPaused && wasPaused) console.log("[Worker] Resumed via admin");
  } catch {
    // non-critical — keep current state
  }
}

async function maybeEnqueueDailyAutoSearch() {
  const now = new Date();
  const isAutoQueueTime =
    now.getUTCHours() === AUTO_QUEUE_HOUR_UTC &&
    now.getUTCMinutes() < 5 &&
    Date.now() - lastAutoQueueRun > AUTO_QUEUE_INTERVAL_MS;
  if (!isAutoQueueTime) return;
  console.log("[Worker] Triggering daily auto search queue");
  await enqueueJob("auto_search_queue", {}, { runAt: now, maxAttempts: 1 });
  lastAutoQueueRun = Date.now();
}

async function maybeEnqueueInstagramBatch() {
  if (Date.now() - lastInstagramBatchRun < INSTAGRAM_BATCH_INTERVAL_MS) return;
  await enqueueJob("instagram_batch_queue", {}, { maxAttempts: 1 });
  lastInstagramBatchRun = Date.now();
}

// Auto lead-assignment: run once per UTC day. Gated on the persistent last_run_at in
// assignment_config so it fires once even across worker restarts; runAssignmentCycle
// itself respects the separate assignment pause flag.
async function maybeRunDailyAssignment() {
  try {
    const db = createAdminClient();
    const { data: cfg } = await db
      .from("assignment_config")
      .select("last_run_at")
      .eq("id", true)
      .maybeSingle<{ last_run_at: string | null }>();

    const startOfTodayUtc = new Date();
    startOfTodayUtc.setUTCHours(0, 0, 0, 0);
    const ranToday = cfg?.last_run_at != null && new Date(cfg.last_run_at) >= startOfTodayUtc;
    if (ranToday) return;

    const result = await runAssignmentCycle(db);
    if (result.status === "completed") {
      console.log(`[Worker] Assignment: ${result.assigned} assigned, ${result.reclaimed} reclaimed`);
    } else {
      console.log(`[Worker] Assignment: ${result.status} (reclaimed ${result.reclaimed})`);
    }
  } catch (error) {
    console.error("[Worker] Assignment cycle failed", error);
  }
}
