"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CirclePause, CirclePlay, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { WorkerSettings } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  processing: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  completed:  "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  failed:     "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  dead:       "bg-surface-muted text-muted",
  cancelled:  "bg-surface-muted text-muted line-through",
};

const STATUS_OPTIONS = ["all", "pending", "processing", "completed", "failed", "dead", "cancelled"];
const TYPE_OPTIONS = [
  "all", "search_run", "enrich_lead", "enrich_instagram",
  "instagram_batch", "instagram_batch_queue",
  "score_lead", "score_batch", "auto_create_demo", "auto_search_queue", "cleanup",
];
const PER_PAGE_OPTIONS = [10, 25, 50, 100];

const STATUS_LABELS: Record<string, string> = {
  pending: "Đang chờ",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  failed: "Thất bại",
  dead: "Không xử lý được",
  cancelled: "Đã hủy",
};

const TYPE_LABELS: Record<string, string> = {
  search_run: "Tìm kiếm",
  enrich_lead: "Làm giàu dữ liệu Lead",
  enrich_instagram: "Làm giàu dữ liệu Instagram",
  instagram_batch: "Batch Instagram",
  instagram_batch_queue: "Hàng đợi batch Instagram",
  score_lead: "Chấm điểm Lead",
  score_batch: "Chấm điểm hàng loạt",
  auto_create_demo: "Tự động tạo demo",
  auto_search_queue: "Hàng đợi tìm kiếm tự động",
  cleanup: "Dọn dẹp",
};

type JobRow = {
  id: string; type: string; status: string; attempts: number;
  max_attempts: number; error: string | null; next_run_at: string;
  created_at: string; updated_at: string; locked_by: string | null;
};

type Props = {
  jobs: JobRow[];
  total: number;
  summary: { pending: number; processing: number; failed: number; dead: number };
  workerPaused: boolean;
  pipelinePaused: boolean;
  demoPaused: boolean;
  pausedBy: string | null;
  pausedAt: string | null;
  page: number;
  perPage: number;
  statusFilter: string;
  typeFilter: string;
};

export function JobsClient({
  jobs, total, summary, workerPaused, pipelinePaused, demoPaused, pausedBy, pausedAt,
  page, perPage, statusFilter, typeFilter,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [paused, setPaused] = useState(workerPaused);
  const [pipelineIsPaused, setPipelineIsPaused] = useState(pipelinePaused);
  const [demoIsPaused, setDemoIsPaused] = useState(demoPaused);
  const [pausedByState, setPausedBy] = useState(pausedBy);
  const [pausedAtState, setPausedAt] = useState(pausedAt);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [togglingAction, setTogglingAction] = useState<string | null>(null);
  const [cancelledIds, setCancelledIds] = useState<Set<string>>(new Set());

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  function setParam(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (value === "all" || value === "") p.delete(key);
    else p.set(key, value);
    if (key !== "page") p.set("page", "1");
    router.push(`?${p.toString()}`);
  }

  async function updateWorker(action: string) {
    setTogglingAction(action);
    const res = await fetch("/api/jobs/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setTogglingAction(null);
    if (!res.ok) { toast.error("Cập nhật trạng thái tiến trình thất bại"); return; }
    const json = await res.json() as { data: WorkerSettings };
    setPaused(json.data.is_paused);
    setPipelineIsPaused(json.data.pipeline_paused);
    setDemoIsPaused(json.data.demo_paused);
    setPausedBy(json.data.paused_by);
    setPausedAt(json.data.paused_at);
    toast.success("Đã cập nhật trạng thái tiến trình");
  }

  async function cancelJob(id: string) {
    setCancellingId(id);
    const res = await fetch(`/api/jobs/${id}`, { method: "PATCH" });
    setCancellingId(null);
    if (!res.ok) {
      const json = await res.json() as { error: string };
      toast.error(json.error ?? "Không thể hủy tiến trình");
      return;
    }
    setCancelledIds((prev) => new Set(prev).add(id));
    toast.success("Đã hủy tiến trình");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Tiến trình</h1>
        <p className="text-sm text-muted">Theo dõi và điều khiển hàng đợi tiến trình.</p>
      </div>

      {/* Worker controls */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-sm font-semibold text-text">Toàn bộ tiến trình</div>
          <div className="mt-1 text-xs text-muted">
            {paused && pausedByState ? (
              <>Tạm dừng bởi {pausedByState}{pausedAtState ? ` · ${new Date(pausedAtState).toLocaleString()}` : ""}</>
            ) : (
              "Điều khiển toàn bộ hàng đợi"
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => updateWorker("resume")}
              disabled={!paused || togglingAction !== null}
              className="gap-2"
            >
              <CirclePlay className="h-4 w-4 text-success" />
              Tiếp tục tất cả
            </Button>
            <Button
              variant="outline"
              onClick={() => updateWorker("pause")}
              disabled={paused || togglingAction !== null}
              className="gap-2"
            >
              <CirclePause className="h-4 w-4 text-warning" />
              Dừng tất cả
            </Button>
          </div>
        </div>

        <div className={`rounded-lg border border-border bg-surface p-4 ${paused ? "opacity-50" : ""}`}>
          <div className="text-sm font-semibold text-text">Lead Pipeline</div>
          <div className="mt-1 text-xs text-muted">Tìm kiếm, Làm giàu dữ liệu, Chấm điểm, Instagram</div>
          <div className="mt-2 text-xs font-medium">
            Status: {pipelineIsPaused || paused ? "🔴 Tạm dừng" : "🟢 Đang chạy"}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => updateWorker("resume_pipeline")}
              disabled={paused || !pipelineIsPaused || togglingAction !== null}
              className="gap-2"
            >
              <CirclePlay className="h-4 w-4 text-success" />
              Tiếp tục
            </Button>
            <Button
              variant="outline"
              onClick={() => updateWorker("pause_pipeline")}
              disabled={paused || pipelineIsPaused || togglingAction !== null}
              className="gap-2"
            >
              <CirclePause className="h-4 w-4 text-warning" />
              Tạm dừng
            </Button>
          </div>
        </div>

        <div className={`rounded-lg border border-border bg-surface p-4 ${paused ? "opacity-50" : ""}`}>
          <div className="text-sm font-semibold text-text">Tạo Demo</div>
          <div className="mt-1 text-xs text-muted">Auto create demo cho lead đủ điều kiện</div>
          <div className="mt-2 text-xs font-medium">
            Status: {demoIsPaused || paused ? "🔴 Tạm dừng" : "🟢 Đang chạy"}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => updateWorker("resume_demo")}
              disabled={paused || !demoIsPaused || togglingAction !== null}
              className="gap-2"
            >
              <CirclePlay className="h-4 w-4 text-success" />
              Tiếp tục
            </Button>
            <Button
              variant="outline"
              onClick={() => updateWorker("pause_demo")}
              disabled={paused || demoIsPaused || togglingAction !== null}
              className="gap-2"
            >
              <CirclePause className="h-4 w-4 text-warning" />
              Tạm dừng
            </Button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {(["pending", "processing", "failed", "dead"] as const).map((s) => (
          <button key={s} onClick={() => setParam("status", s)} className="text-left">
            <Card className={statusFilter === s ? "ring-2 ring-accent" : ""}>
              <CardContent className="p-4">
                <div className="text-xs text-muted">{STATUS_LABELS[s]}</div>
                <div className="mt-1 text-2xl font-semibold text-text">{summary[s]}</div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setParam("status", e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s === "all" ? "Tất cả trạng thái" : STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setParam("type", e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t === "all" ? "Tất cả loại" : TYPE_LABELS[t] ?? t}</option>
          ))}
        </select>
        {(statusFilter !== "all" || typeFilter !== "all") && (
          <button
            onClick={() => { setParam("status", "all"); setParam("type", "all"); }}
            className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted hover:text-text"
          >
            <X className="h-3 w-3" /> Xóa lọc
          </button>
        )}
      </div>

      {/* Job table */}
      <div className="rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3">Loại</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Số lần thử</th>
                <th className="px-4 py-3">Tiến trình</th>
                <th className="px-4 py-3">Lỗi</th>
                <th className="px-4 py-3">Ngày tạo</th>
                <th className="px-4 py-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">
                    Không tìm thấy tiến trình.
                  </td>
                </tr>
              )}
              {jobs.map((job) => {
                const isCancelled = cancelledIds.has(job.id) || job.status === "cancelled";
                const effectiveStatus = cancelledIds.has(job.id) ? "cancelled" : job.status;
                const canCancel = job.status === "pending" && !cancelledIds.has(job.id);
                return (
                  <tr key={job.id} className="border-b border-border last:border-0 hover:bg-surface-muted/40">
                    <td className="px-4 py-3 text-xs">{TYPE_LABELS[job.type] ?? job.type}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[effectiveStatus] ?? "bg-surface-muted text-muted"}`}>
                        {STATUS_LABELS[effectiveStatus] ?? effectiveStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {job.attempts}/{job.max_attempts}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted truncate max-w-[120px]">
                      {job.locked_by ?? "—"}
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {job.error ? (
                        <span className="text-xs text-danger truncate block" title={job.error}>
                          {job.error.slice(0, 60)}{job.error.length > 60 ? "…" : ""}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canCancel && (
                        <button
                          onClick={() => cancelJob(job.id)}
                          disabled={cancellingId === job.id}
                          className="flex items-center gap-1 ml-auto rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                          {cancellingId === job.id ? "…" : "Hủy"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted">
          <div className="flex items-center gap-2">
            <span>Hiển thị</span>
            <select
              value={perPage}
              onChange={(e) => setParam("per_page", e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>/ {total.toLocaleString()} tiến trình</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setParam("page", String(page - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setParam("page", String(page + 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
