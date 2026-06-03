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
  { key: "hair_salon", label: "Hair salon" },
  { key: "nail_salon", label: "Nail salon" },
  { key: "day_spa", label: "Day spa" },
  { key: "med_spa", label: "Med spa" },
  { key: "lash_studio", label: "Lash studio" },
  { key: "waxing_studio", label: "Waxing" },
  { key: "barbershop", label: "Barbershop" },
  { key: "tattoo_studio", label: "Tattoo" },
  { key: "pet_grooming", label: "Pet grooming" },
];

const MODE_LABELS: Record<AssignmentPriorityMode, string> = {
  p1_only: "P1 only",
  p2_only: "P2 only",
  p3_only: "P3 only",
  waterfall: "Waterfall (P1 → P2 → P3)",
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
      toast.error("Select at least one business type");
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
      toast.error((await res.json()).error ?? "Save failed");
      return;
    }
    toast.success("Config saved");
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
      toast.error("Failed to update pause");
      return;
    }
    toast.success(next ? "Assignment paused" : "Assignment resumed");
  }

  async function runNow() {
    setRunning(true);
    const res = await fetch("/api/assignment/run", { method: "POST" });
    setRunning(false);
    if (!res.ok) {
      toast.error("Run failed");
      return;
    }
    const { data } = await res.json() as { data: { status: string; assigned: number; reclaimed: number } };
    toast.success(
      data.status === "completed"
        ? `Assigned ${data.assigned} · reclaimed ${data.reclaimed}`
        : `Cycle: ${data.status}`,
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
          Assignment is paused — pool is held, nothing is distributed. Crawling still runs.
        </div>
      )}

      {/* Pool stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["P1 pool", stats.pool.p1, "emerald"],
          ["P2 pool", stats.pool.p2, "amber"],
          ["P3 pool", stats.pool.p3, "slate"],
          ["Total assignable", stats.pool.total, "violet"],
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
            <CardTitle className="text-sm">Runway</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-text">
                {stats.runwayDays === null ? "—" : stats.runwayDays}
              </span>
              <span className="text-sm text-muted">days at current config</span>
            </div>
            <div className="space-y-1 text-sm text-muted">
              <div className="flex justify-between"><span>Active reps</span><span className="text-text">{stats.activeReps}</span></div>
              <div className="flex justify-between"><span>Per rep / day</span><span className="text-text">{stats.maxPerDay}</span></div>
              <div className="flex justify-between"><span>Daily demand</span><span className="text-text">{stats.dailyDemand} leads</span></div>
              <div className="flex justify-between"><span>Mode</span><span className="text-text">{MODE_LABELS[stats.priorityMode]}</span></div>
            </div>
            <p className="text-xs text-muted">Excludes leads still being crawled/scored. Refills as crawl runs.</p>
            {stats.lastRunAt && (
              <p className="text-xs text-muted">
                Last run: {new Date(stats.lastRunAt).toLocaleString()} · assigned {stats.lastRunAssigned}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Config */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Configuration</CardTitle>
              <Badge variant={isPaused ? "amber" : "emerald"}>{isPaused ? "Paused" : "Active"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Verticals */}
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted">Business types</div>
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
              <div className="mb-1.5 text-xs font-medium text-muted">Max new leads per rep / day</div>
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
              <div className="mb-1.5 text-xs font-medium text-muted">Priority mode</div>
              <Select value={mode} onChange={(e) => setMode(e.target.value as AssignmentPriorityMode)}>
                {(Object.keys(MODE_LABELS) as AssignmentPriorityMode[]).map((m) => (
                  <option key={m} value={m}>{MODE_LABELS[m]}</option>
                ))}
              </Select>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button onClick={saveConfig} disabled={saving}>
                {saving ? "Saving…" : "Save config"}
              </Button>
              <Button variant="outline" onClick={togglePause}>
                {isPaused ? <><Play className="mr-1.5 h-3.5 w-3.5" /> Resume</> : <><Pause className="mr-1.5 h-3.5 w-3.5" /> Pause</>}
              </Button>
              <Button variant="outline" onClick={runNow} disabled={running || isPaused}>
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                {running ? "Running…" : "Run now"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
