"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { StageBadge } from "./StageBadge";
import { buildRingbookerDemoUrl } from "@/lib/demo-url";
import type { LeadStage, PipelineLead } from "@/types";

type MyDayLead = PipelineLead & {
  city?: string | null;
  state?: string | null;
  sales_stage?: LeadStage;
  demo: (NonNullable<PipelineLead["demo"]> & { status?: string | null }) | null;
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
  showDemoLink,
  onSelectLead,
}: {
  lead: MyDayLead;
  urgent?: boolean;
  showDemoLink?: boolean;
  onSelectLead: (lead: PipelineLead) => void;
}) {
  const demoSlug = lead.demo?.slug;
  const demoUrl = buildRingbookerDemoUrl(demoSlug);

  return (
    <div className="rounded-md border border-border bg-background p-3 transition-colors hover:bg-surface-muted">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onSelectLead(lead)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate text-sm font-semibold text-text">{lead.name}</div>
          <div className="mt-0.5 truncate text-xs text-muted">{lead.location}</div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {showDemoLink && demoUrl ? (
            <button
              type="button"
              onClick={() => window.open(demoUrl, "_blank", "noopener,noreferrer")}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-violet-300 hover:text-violet-700"
            >
              <ExternalLink className="h-3 w-3" />
              <span>👁 Xem demo</span>
            </button>
          ) : null}
          <StageBadge stage={lead.stage} />
        </div>
      </div>
      {urgent && lead.daysSinceLastAction != null ? (
        <div className="mt-2 text-xs font-medium text-red-600">
          {lead.daysSinceLastAction} ngày chưa xử lý
        </div>
      ) : null}
    </div>
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
              {buildingDemos ? "Đang chạy..." : "⚡ Tạo demo"}
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
              {running ? "Đang chạy..." : "Chạy ngay"}
            </button>
          ) : null}
          {group.leads.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
              Trống
            </div>
          ) : (
            group.leads.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                urgent={id === "urgent"}
                showDemoLink={id === "readyToAssign"}
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
    setBuildingDemos(true);
    try {
      const res = await fetch("/api/demos/build-pool", { method: "POST" });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        toast.error(json?.error ?? "Tạo demo thất bại");
        return;
      }

      if (json?.status === "sufficient") {
        toast.success(
          `✅ Pool đã đủ demo cho hôm nay (${json.preparedUnassigned ?? 0} demos sẵn sàng)`,
        );
      } else if (json?.status === "queued") {
        toast.success(`⚡ Đã queue ${json.queued ?? 0} demos để tạo. Worker sẽ xử lý trong vài phút.`);
        window.setTimeout(() => {
          load();
        }, 3000);
      } else if (json?.status === "no_leads") {
        toast.info("Không có lead đủ điều kiện");
      } else {
        toast.error("Tạo demo thất bại");
      }
    } catch {
      toast.error("Tạo demo thất bại");
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
        label="🔴 Cần xử lý ngay"
        group={data.urgent}
        open={open.urgent}
        onToggle={() => setOpen((prev) => ({ ...prev, urgent: !prev.urgent }))}
        onSelectLead={onSelectLead}
      />
      <GroupSection
        id="assignedToday"
        label="🟡 Đã giao hôm nay"
        group={data.assignedToday}
        open={open.assignedToday}
        onToggle={() => setOpen((prev) => ({ ...prev, assignedToday: !prev.assignedToday }))}
        onSelectLead={onSelectLead}
      />
      <GroupSection
        id="readyToAssign"
        label="🟢 Sẵn sàng giao"
        group={data.readyToAssign}
        open={open.readyToAssign}
        running={running}
        onToggle={() => setOpen((prev) => ({ ...prev, readyToAssign: !prev.readyToAssign }))}
        onSelectLead={onSelectLead}
        onRunNow={runNow}
      />
      <GroupSection
        id="waitingDemo"
        label="⚪ Chờ demo"
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
