"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { AssignmentConfig, AssignmentPoolStats, AssignmentPriorityMode } from "@/types";

const VERTICAL_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "hair_salon", label: "Salon tóc" },
  { key: "nail_salon", label: "Tiệm nail" },
  { key: "day_spa", label: "Spa" },
  { key: "med_spa", label: "Spa y tế" },
  { key: "lash_studio", label: "Studio mi" },
  { key: "waxing_studio", label: "Tẩy lông" },
  { key: "barbershop", label: "Tiệm cắt tóc nam" },
  { key: "tattoo_studio", label: "Xăm" },
  { key: "pet_grooming", label: "Chăm sóc thú cưng" },
];

const MODE_LABELS: Record<AssignmentPriorityMode, string> = {
  p1_only: "Chỉ P1",
  p2_only: "Chỉ P2",
  p3_only: "Chỉ P3",
  waterfall: "Xếp tầng (P1 → P2 → P3)",
};

export function AssignmentClient({
  initialConfig,
  initialStats,
}: {
  initialConfig: AssignmentConfig;
  initialStats: AssignmentPoolStats;
}) {
  const router = useRouter();
  const [verticals, setVerticals] = useState<string[]>(initialConfig.verticals);
  const [maxPerDay, setMaxPerDay] = useState(String(initialConfig.max_per_day));
  const [mode, setMode] = useState<AssignmentPriorityMode>(initialConfig.priority_mode);
  const [isPaused, setIsPaused] = useState(initialConfig.is_paused);
  const [stats, setStats] = useState(initialStats);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  function toggleVertical(key: string) {
    setVerticals((prev) => (prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]));
  }

  async function refreshPool() {
    const res = await fetch("/api/assignment/pool");
    if (res.ok) setStats((await res.json()).data);
  }

  async function saveConfig() {
    if (verticals.length === 0) {
      toast.error("Chọn ít nhất một loại doanh nghiệp");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/assignment/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verticals,
        max_per_day: Number(maxPerDay),
        priority_mode: mode,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Lưu thất bại");
      return;
    }
    toast.success("Đã lưu cấu hình");
    await refreshPool();
    router.refresh();
  }

  async function togglePause() {
    const next = !isPaused;
    setIsPaused(next);
    const res = await fetch("/api/assignment/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_paused: next }),
    });
    if (!res.ok) {
      setIsPaused(!next);
      toast.error("Cập nhật tạm dừng thất bại");
      return;
    }
    toast.success(next ? "Giao việc đã tạm dừng" : "Giao việc đã tiếp tục");
  }

  async function runNow() {
    setRunning(true);
    const res = await fetch("/api/assignment/run", { method: "POST" });
    setRunning(false);
    if (!res.ok) {
      toast.error("Chạy thất bại");
      return;
    }
    const { data } = await res.json() as { data: { status: string; assigned: number; reclaimed: number } };
    toast.success(
      data.status === "completed"
        ? `Đã giao ${data.assigned} · thu hồi ${data.reclaimed}`
        : `Chu kỳ: ${data.status}`,
    );
    await refreshPool();
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Pause banner */}
      {isPaused && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <Pause className="h-4 w-4" />
          Giao việc đang tạm dừng — kho được giữ lại, không có lead nào được phân phối. Crawl vẫn chạy.
        </div>
      )}

      {/* Pool stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Kho P1", stats.pool.p1, "emerald"],
          ["Kho P2", stats.pool.p2, "amber"],
          ["Kho P3", stats.pool.p3, "slate"],
          ["Tổng có thể giao", stats.pool.total, "violet"],
        ].map(([label, value, accent]) => (
          <Card key={label as string}>
            <CardContent className="p-4">
              <div className="text-xs text-muted">{label}</div>
              <div className={`mt-1 text-2xl font-semibold ${
                accent === "emerald" ? "text-emerald-600" :
                accent === "amber" ? "text-amber-600" :
                accent === "violet" ? "text-violet-700" : "text-text"
              }`}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Runway */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Số ngày đủ lead</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-text">
                {stats.runwayDays === null ? "—" : stats.runwayDays}
              </span>
              <span className="text-sm text-muted">ngày với cấu hình hiện tại</span>
            </div>
            <div className="space-y-1 text-sm text-muted">
              <div className="flex justify-between"><span>Rep đang hoạt động</span><span className="text-text">{stats.activeReps}</span></div>
              <div className="flex justify-between"><span>Mỗi rep / ngày</span><span className="text-text">{stats.maxPerDay}</span></div>
              <div className="flex justify-between"><span>Nhu cầu mỗi ngày</span><span className="text-text">{stats.dailyDemand} Lead</span></div>
              <div className="flex justify-between"><span>Chế độ</span><span className="text-text">{MODE_LABELS[stats.priorityMode]}</span></div>
            </div>
            <p className="text-xs text-muted">Không gồm lead vẫn đang crawl/chấm điểm. Kho sẽ được nạp thêm khi crawl chạy.</p>
            {stats.lastRunAt && (
              <p className="text-xs text-muted">
                Lần chạy gần nhất: {new Date(stats.lastRunAt).toLocaleString()} · đã giao {stats.lastRunAssigned}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Config */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Cấu hình</CardTitle>
              <Badge variant={isPaused ? "amber" : "emerald"}>{isPaused ? "Tạm dừng" : "Đang hoạt động"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Verticals */}
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted">Loại doanh nghiệp</div>
              <div className="flex flex-wrap gap-1.5">
                {VERTICAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => toggleVertical(opt.key)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      verticals.includes(opt.key)
                        ? "bg-violet-600 text-white"
                        : "border border-border bg-surface text-muted hover:text-text"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Max per day */}
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted">Lead mới tối đa mỗi rep / ngày</div>
              <Input
                type="number"
                min={1}
                max={500}
                value={maxPerDay}
                onChange={(e) => setMaxPerDay(e.target.value)}
                className="w-32"
              />
            </div>

            {/* Priority mode */}
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted">Chế độ ưu tiên</div>
              <Select value={mode} onChange={(e) => setMode(e.target.value as AssignmentPriorityMode)}>
                {(Object.keys(MODE_LABELS) as AssignmentPriorityMode[]).map((m) => (
                  <option key={m} value={m}>{MODE_LABELS[m]}</option>
                ))}
              </Select>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button onClick={saveConfig} disabled={saving}>
                {saving ? "Đang lưu…" : "Lưu cấu hình"}
              </Button>
              <Button variant="outline" onClick={togglePause}>
                {isPaused ? <><Play className="mr-1.5 h-3.5 w-3.5" /> Tiếp tục</> : <><Pause className="mr-1.5 h-3.5 w-3.5" /> Tạm dừng</>}
              </Button>
              <Button variant="outline" onClick={runNow} disabled={running || isPaused}>
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                {running ? "Đang chạy…" : "Chạy ngay"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
