import { createAdminClient } from "@/lib/supabase/admin";
import type { Job, JobType } from "@/types";

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  options?: { maxAttempts?: number; runAt?: Date },
): Promise<string> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("jobs")
    .insert({
      type,
      payload,
      max_attempts: options?.maxAttempts ?? 3,
      next_run_at: (options?.runAt ?? new Date()).toISOString(),
      status: "pending",
    })
    .select("id")
    .single<{ id: string }>();

  if (error) throw new Error(`Failed to enqueue ${type}: ${error.message}`);
  return data.id;
}

export async function claimNextJob(workerId: string): Promise<Job | null> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("claim_next_job", { p_worker_id: workerId });
  if (error) throw new Error(`Failed to claim job: ${error.message}`);
  // Supabase returns {id: null, ...} (not JS null) when the SQL function finds no row
  const job = data as Job | null;
  if (!job?.id) return null;
  return job;
}

export async function releaseStaleJobs(timeoutMinutes = 15): Promise<number> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("release_stale_jobs", { p_timeout_minutes: timeoutMinutes });
  if (error) throw new Error(`Failed to release stale jobs: ${error.message}`);
  return Number(data ?? 0);
}

export async function completeJob(jobId: string, result?: Record<string, unknown>) {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("jobs")
    .update({
      status: "completed",
      result: result ?? {},
      error: null,
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) throw new Error(`Failed to complete job: ${error.message}`);
}

export async function failJob(job: Job, error: unknown) {
  const adminClient = createAdminClient();
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = job.attempts >= job.max_attempts;
  const backoffMs = Math.min(30_000 * Math.pow(4, Math.max(0, job.attempts - 1)), 600_000);

  const { error: updateError } = await adminClient
    .from("jobs")
    .update({
      status: exhausted ? "dead" : "pending",
      error: message,
      locked_at: null,
      locked_by: null,
      next_run_at: new Date(Date.now() + backoffMs).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  if (updateError) throw new Error(`Failed to fail job: ${updateError.message}`);
}
