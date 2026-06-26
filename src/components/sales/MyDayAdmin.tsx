"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StageBadge } from "./StageBadge";
import type { LeadStage, PipelineLead } from "@/types";

type MyDayLead = PipelineLead & {
  city?: string | null;
  state?: string | null;
  sales_stage?: LeadStage;
  daysSinceLastAction?: number | null;
};

type Group = {
  count: number;
  leads: MyDayLead[];
};

type MyDayData = {
  urgent: Group;
  assignedToday: Group;
  readyToAssign: Group;
  waitingDemo: Group;
};

const EMPTY_DATA: MyDayData = {
  urgent: { count: 0, leads: [] },
  assignedToday: { count: 0, leads: [] },
  readyToAssign: { count: 0, leads: [] },
  waitingDemo: { count: 0, leads: [] },
};

function LeadRow({
  lead,
  urgent,
  onSelectLead,
}: {
  lead: MyDayLead;
  urgent?: boolean;
  onSelectLead: (lead: PipelineLead) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectLead(lead)}
      className="w-full rounded-md border border-border bg-background p-3 text-left transition-colors hover:bg-surface-muted"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text">{lead.name}</div>
          <div className="mt-0.5 truncate text-xs text-muted">{lead.location}</div>
        </div>
        <StageBadge stage={lead.stage} />
      </div>
      {urgent && lead.daysSinceLastAction != null ? (
        <div className="mt-2 text-xs font-medium text-red-600">
          {lead.daysSinceLastAction} days without action
        </div>
      ) : null}
    </button>
  );
}

function GroupSection({
  id,
  label,
  group,
  open,
  running,
  buildingDemos,
  onToggle,
  onSelectLead,
  onRunNow,
  onBuildDemos,
}: {
  id: keyof MyDayData;
  label: string;
  group: Group;
  open: boolean;
  running?: boolean;
  buildingDemos?: boolean;
  onToggle: () => void;
  onSelectLead: (lead: PipelineLead) => void;
  onRunNow?: () => void;
  onBuildDemos?: () => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <span className="text-sm font-semibold text-text">{label}</span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {id === "waitingDemo" && group.count > 0 ? (
            <button
              type="button"
              onClick={onBuildDemos}
              disabled={buildingDemos}
              className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
            >
              {buildingDemos ? "Building..." : "⚡ Build demos"}
            </button>
          ) : null}
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text">
            {group.count}
          </span>
        </div>
      </div>
      {open ? (
        <div className="space-y-2 border-t border-border p-3">
          {id === "readyToAssign" ? (
            <button
              type="button"
              onClick={onRunNow}
              disabled={running}
              className="mb-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
            >
              {running ? "Running..." : "Run now"}
            </button>
          ) : null}
          {group.leads.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
              Empty
            </div>
          ) : (
            group.leads.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                urgent={id === "urgent"}
                onSelectLead={onSelectLead}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

export function MyDayAdmin({
  onSelectLead,
  reloadSignal = 0,
}: {
  onSelectLead: (lead: PipelineLead) => void;
  reloadSignal?: number;
}) {
  const [data, setData] = useState<MyDayData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [buildingDemos, setBuildingDemos] = useState(false);
  const [open, setOpen] = useState<Record<keyof MyDayData, boolean>>({
    urgent: false,
    assignedToday: false,
    readyToAssign: false,
    waitingDemo: false,
  });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/sales/my-day");
      const json = res.ok ? await res.json() : null;
      const next = json?.data ?? EMPTY_DATA;
      setData(next);
      setOpen((prev) => ({ ...prev, urgent: next.urgent.count > 0 }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [reloadSignal]);

  async function runNow() {
    setRunning(true);
    try {
      await fetch("/api/assignment/run", { method: "POST" });
      await load();
    } finally {
      setRunning(false);
    }
  }

  async function buildDemos() {
    const leadIds = data.waitingDemo.leads.map((lead) => lead.id).slice(0, 50);
    if (leadIds.length === 0) return;

    setBuildingDemos(true);
    try {
      const res = await fetch("/api/demos/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        toast.error(json?.error ?? "Failed to build demos");
        return;
      }

      const failed = (json?.data ?? []).filter((item: { error?: string }) => item.error).length;
      if (failed > 0) {
        toast.error(`Failed to build ${failed} demos`);
      } else if (data.waitingDemo.leads.length > 50) {
        toast.success(
          `Built demos for first 50 leads. Run again for remaining ${data.waitingDemo.leads.length - 50} leads.`,
        );
      }

      await load();
    } catch {
      toast.error("Failed to build demos");
    } finally {
      setBuildingDemos(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <GroupSection
        id="urgent"
        label="🔴 Needs attention"
        group={data.urgent}
        open={open.urgent}
        onToggle={() => setOpen((prev) => ({ ...prev, urgent: !prev.urgent }))}
        onSelectLead={onSelectLead}
      />
      <GroupSection
        id="assignedToday"
        label="🟡 Assigned today"
        group={data.assignedToday}
        open={open.assignedToday}
        onToggle={() => setOpen((prev) => ({ ...prev, assignedToday: !prev.assignedToday }))}
        onSelectLead={onSelectLead}
      />
      <GroupSection
        id="readyToAssign"
        label="🟢 Ready to assign"
        group={data.readyToAssign}
        open={open.readyToAssign}
        running={running}
        onToggle={() => setOpen((prev) => ({ ...prev, readyToAssign: !prev.readyToAssign }))}
        onSelectLead={onSelectLead}
        onRunNow={runNow}
      />
      <GroupSection
        id="waitingDemo"
        label="⚪ Waiting for demo"
        group={data.waitingDemo}
        open={open.waitingDemo}
        buildingDemos={buildingDemos}
        onToggle={() => setOpen((prev) => ({ ...prev, waitingDemo: !prev.waitingDemo }))}
        onSelectLead={onSelectLead}
        onBuildDemos={buildDemos}
      />
    </div>
  );
}
