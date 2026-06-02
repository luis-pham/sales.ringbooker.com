import { NextRequest, NextResponse } from "next/server";
import { dispatchJob } from "@/lib/jobs/dispatch";
import { claimNextJob, completeJob, failJob, releaseStaleJobs } from "@/lib/jobs/queue";
import { verifyInternalRequest } from "@/lib/utils/security";

export async function GET(request: NextRequest) {
  if (!verifyInternalRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await releaseStaleJobs(15);
  const job = await claimNextJob("vercel-cron");
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
