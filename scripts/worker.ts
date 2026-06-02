import "dotenv/config";
import { env } from "../src/lib/env";
import { dispatchJob } from "../src/lib/jobs/dispatch";
import { claimNextJob, completeJob, enqueueJob, failJob, releaseStaleJobs } from "../src/lib/jobs/queue";

let shuttingDown = false;
const workerId = env.workerId;
const pollIntervalMs = Number.isFinite(env.workerPollIntervalMs) ? env.workerPollIntervalMs : 2000;
let lastAutoQueueRun = 0;
const AUTO_QUEUE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AUTO_QUEUE_HOUR_UTC = 2;
let lastInstagramBatchRun = 0;
const INSTAGRAM_BATCH_INTERVAL_MS = 60 * 60 * 1000; // every hour

process.on("SIGINT", () => {
  shuttingDown = true;
});
process.on("SIGTERM", () => {
  shuttingDown = true;
});

console.log(`[Worker] Starting ${workerId}`);
console.log(`[Worker] Poll interval: ${pollIntervalMs}ms`);

while (!shuttingDown) {
  try {
    await releaseStaleJobs(15);
    await maybeEnqueueDailyAutoSearch();
    await maybeEnqueueInstagramBatch();
    const job = await claimNextJob(workerId);
    if (!job) {
      await sleep(pollIntervalMs);
      continue;
    }
    try {
      await dispatchJob(job);
    } catch (error) {
      await failJob(job, error);
      throw error;
    }
    await completeJob(job.id, { completedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[Worker] tick failed", error);
    await sleep(pollIntervalMs);
  }
}

console.log("[Worker] Shutdown complete");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
