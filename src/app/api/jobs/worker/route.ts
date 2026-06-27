import { NextRequest, NextResponse } from "next/server";
import { dispatchJob } from "@/lib/jobs/dispatch";
import { claimNextJob, completeJob, failJob, releaseStaleJobs } from "@/lib/jobs/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyInternalRequest } from "@/lib/utils/security";
import type { JobType, WorkerSettings } from "@/types";

const DEFAULT_WORKER_SETTINGS: WorkerSettings = {
  is_paused: false,
  pipeline_paused: false,
  demo_paused: false,
  paused_by: null,
  paused_at: null,
  updated_at: null,
};

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
  const workerSettings = settings ?? DEFAULT_WORKER_SETTINGS;
  if (workerSettings.is_paused) {
    return NextResponse.json({ data: { status: "paused" } });
  }

  const allowedTypes = getAllowedJobTypes(workerSettings);
  if (allowedTypes.length === 0) {
    return NextResponse.json({ data: { status: "paused" } });
  }

  await releaseStaleJobs(15);
  const job = await claimNextJob("vercel-cron", allowedTypes);
  if (!job) return NextResponse.json({ data: { status: "idle" } });

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
