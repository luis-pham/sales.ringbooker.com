import "dotenv/config";
import { env } from "../src/lib/env";
import { dispatchJob } from "../src/lib/jobs/dispatch";
import { claimNextJob, completeJob, enqueueJob, failJob, releaseStaleJobs } from "../src/lib/jobs/queue";
import { runAssignmentCycle, topUpPoolDemos } from "../src/lib/assignment/assignment-service";
import { createAdminClient } from "../src/lib/supabase/admin";
import type { JobType, WorkerSettings } from "../src/types";

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
let workerSettings: WorkerSettings = {
  is_paused: false,
  pipeline_paused: false,
  demo_paused: false,
  paused_by: null,
  paused_at: null,
  updated_at: null,
};
const MAINTENANCE_INTERVAL_MS = 5_000;

const PIPELINE_JOB_TYPES: JobType[] = [
  "search_run",
  "enrich_lead",
  "enrich_instagram",
  "instagram_batch",
  "instagram_batch_queue",
  "score_lead",
  "score_batch",
  "auto_search_queue",
  "cleanup",
];

const DEMO_JOB_TYPES: JobType[] = [
  "auto_create_demo",
];

function getAllowedJobTypes(settings: WorkerSettings): JobType[] {
  if (settings.is_paused) return [];

  const allowed: JobType[] = [];
  if (!settings.pipeline_paused) allowed.push(...PIPELINE_JOB_TYPES);
  if (!settings.demo_paused) allowed.push(...DEMO_JOB_TYPES);

  return allowed;
}

// Nightly demo-build window — runs while the US is asleep so building demos never
// competes with ringbooker.com's US traffic, and finishes before assignment.
// 05:00–08:00 UTC = 12:00–15:00 giờ VN  (US East ~1–4am, US West ~10pm–1am).
const DEMO_WINDOW_START_HOUR_UTC = 5;
const DEMO_WINDOW_END_HOUR_UTC = 8;
const DEMO_TOPUP_PER_TICK = 3; // throttle demos created per maintenance tick

// Daily auto-assignment fires at 16:00 giờ VN = 09:00 UTC (after the demo window).
const ASSIGNMENT_HOUR_UTC = 9;

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
      if (workerSettings.is_paused) {
        await sleep(pollIntervalMs);
        continue;
      }

      const allowedTypes = getAllowedJobTypes(workerSettings);
      if (allowedTypes.length === 0) {
        await sleep(pollIntervalMs);
        continue;
      }

      const job = await claimNextJob(laneWorkerId, allowedTypes);
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
      if (!workerSettings.is_paused) {
        await releaseStaleJobs(15);
        await maybeEnqueueDailyAutoSearch();
        await maybeEnqueueInstagramBatch();
        await maybeTopUpDemos();
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
      .select("is_paused, pipeline_paused, demo_paused, paused_by, paused_at, updated_at")
      .eq("id", true)
      .single<WorkerSettings>();

    const wasPaused = workerSettings.is_paused;
    workerSettings = data ?? workerSettings;

    if (workerSettings.is_paused && !wasPaused) console.log("[Worker] Paused via admin");
    if (!workerSettings.is_paused && wasPaused) console.log("[Worker] Resumed via admin");
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

// Nightly demo build: only inside the US-asleep window, throttled per tick. Tops up
// demos for the leads the next assignment cycle will hand out, so the RingBooker
// demo API is hit off-peak and every assignable lead has a demo ready.
async function maybeTopUpDemos() {
  const hour = new Date().getUTCHours();
  if (hour < DEMO_WINDOW_START_HOUR_UTC || hour >= DEMO_WINDOW_END_HOUR_UTC) return;
  try {
    const result = await topUpPoolDemos(createAdminClient(), DEMO_TOPUP_PER_TICK);
    if (result.created > 0 || result.failed > 0) {
      console.log(`[Worker] Demo top-up: ${result.created} created, ${result.failed} failed, ${result.skipped} skipped`);
    }
  } catch (error) {
    console.error("[Worker] Demo top-up failed", error);
  }
}

// Auto lead-assignment: fires once per UTC day at ASSIGNMENT_HOUR_UTC (16:00 giờ VN).
// Gated on the persistent last_run_at in assignment_config so it fires once even
// across worker restarts; runAssignmentCycle itself respects the assignment pause flag.
async function maybeRunDailyAssignment() {
  if (new Date().getUTCHours() !== ASSIGNMENT_HOUR_UTC) return;
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
