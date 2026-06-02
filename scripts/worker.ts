import "dotenv/config";
import { env } from "../src/lib/env";
import { dispatchJob } from "../src/lib/jobs/dispatch";
import { claimNextJob, completeJob, failJob, releaseStaleJobs } from "../src/lib/jobs/queue";

let shuttingDown = false;
const workerId = env.workerId;
const pollIntervalMs = Number.isFinite(env.workerPollIntervalMs) ? env.workerPollIntervalMs : 2000;

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
