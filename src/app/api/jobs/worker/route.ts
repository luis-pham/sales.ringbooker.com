import { NextRequest, NextResponse } from "next/server";
import { dispatchJob } from "@/lib/jobs/dispatch";
import { claimNextJob, completeJob, failJob, releaseStaleJobs } from "@/lib/jobs/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyInternalRequest } from "@/lib/utils/security";
import type { Job, WorkerSettings } from "@/types";

const PIPELINE_JOB_TYPES = [
  "search_run",
  "enrich_lead",
  "enrich_instagram",
  "instagram_batch",
  "instagram_batch_queue",
  "score_lead",
  "score_batch",
  "auto_search_queue",
];

const DEMO_JOB_TYPES = [
  "auto_create_demo",
];

function shouldSkipJob(jobType: string, settings: WorkerSettings): boolean {
  if (settings.is_paused) return true;
  if (settings.pipeline_paused && PIPELINE_JOB_TYPES.includes(jobType)) return true;
  if (settings.demo_paused && DEMO_JOB_TYPES.includes(jobType)) return true;
  return false;
}

async function releaseSkippedJob(job: Job) {
  await createAdminClient()
    .from("jobs")
    .update({
      status: "pending",
      locked_at: null,
      locked_by: null,
      attempts: job.attempts,
      next_run_at: new Date(Date.now() + 2000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
}

export async function GET(request: NextRequest) {
  if (!verifyInternalRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Respect the global pause switch (same flag the standalone worker reads).
  const { data: settings } = await createAdminClient()
    .from("worker_settings")
    .select("is_paused, pipeline_paused, demo_paused, paused_by, paused_at, updated_at")
    .eq("id", true)
    .maybeSingle<WorkerSettings>();
  if (settings?.is_paused) {
    return NextResponse.json({ data: { status: "paused" } });
  }

  await releaseStaleJobs(15);
  const job = await claimNextJob("vercel-cron");
  if (!job) return NextResponse.json({ data: { status: "idle" } });

  if (settings && shouldSkipJob(job.type, settings)) {
    await releaseSkippedJob(job);
    return NextResponse.json({ data: { status: "skipped", jobId: job.id, type: job.type } });
  }

  try {
    await dispatchJob(job);
    await completeJob(job.id, { completedAt: new Date().toISOString(), via: "vercel-cron" });
    return NextResponse.json({ data: { status: "completed", jobId: job.id, type: job.type } });
  } catch (error) {
    await failJob(job, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export const POST = GET;
