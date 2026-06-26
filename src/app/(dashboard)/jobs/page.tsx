import { Suspense } from "react";
import { requireRole } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { JobsClient } from "./JobsClient";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; page?: string; per_page?: string }>;
}) {
  await requireRole("admin");
  const { status = "all", type = "all", page = "1", per_page = "25" } = await searchParams;

  const perPage = Math.min(100, Math.max(10, Number(per_page) || 25));
  const pageNum = Math.max(1, Number(page) || 1);
  const offset = (pageNum - 1) * perPage;

  const adminClient = createAdminClient();

  // Fetch jobs + worker state in parallel
  const [jobsResult, workerResult] = await Promise.all([
    (() => {
      let q = adminClient
        .from("jobs")
        .select("id, type, status, attempts, max_attempts, error, next_run_at, created_at, updated_at, locked_by", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + perPage - 1);
      if (status !== "all") q = q.eq("status", status);
      if (type !== "all") q = q.eq("type", type);
      return q;
    })(),
    adminClient
      .from("worker_settings")
      .select("is_paused, paused_by, paused_at")
      .eq("id", true)
      .maybeSingle<{ is_paused: boolean; paused_by: string | null; paused_at: string | null }>(),
  ]);

  const [pending, processing, failed, dead] = await Promise.all([
    adminClient.from("jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
    adminClient.from("jobs").select("id", { count: "exact", head: true }).eq("status", "processing"),
    adminClient.from("jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    adminClient.from("jobs").select("id", { count: "exact", head: true }).eq("status", "dead"),
  ]);

  const summary = {
    pending: pending.count ?? 0,
    processing: processing.count ?? 0,
    failed: failed.count ?? 0,
    dead: dead.count ?? 0,
  };

  return (
    <Suspense>
      <JobsClient
        jobs={(jobsResult.data ?? []) as any[]}
        total={jobsResult.count ?? 0}
        summary={summary}
        workerPaused={workerResult.data?.is_paused ?? false}
        pausedBy={workerResult.data?.paused_by ?? null}
        pausedAt={workerResult.data?.paused_at ?? null}
        page={pageNum}
        perPage={perPage}
        statusFilter={status}
        typeFilter={type}
      />
    </Suspense>
  );
}
