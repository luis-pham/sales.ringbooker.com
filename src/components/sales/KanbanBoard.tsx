"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Play } from "lucide-react";
import { STAGE_META } from "@/lib/stageConfig";
import type { LeadStage, PipelineLead } from "@/types";

type KanbanLead = PipelineLead & {
  city?: string | null;
  state?: string | null;
  sales_stage?: LeadStage;
  assigned_to?: string | null;
  updated_at?: string;
  assignedRepName?: string | null;
};

type StageGroup = {
  count: number;
  leads: KanbanLead[];
};

type KanbanData = Record<LeadStage, StageGroup>;

const STAGES: LeadStage[] = ["ready", "sent", "viewed", "hot", "replied", "converted"];
const ACTIVE_STAGES: LeadStage[] = ["sent", "viewed", "hot", "replied", "converted"];

type PipelineSummary = {
  waitingDemo: number;
  readyToAssign: number;
  assignedToday: number;
  active: number;
};

type OutreacherSummary = {
  totalAssigned: number;
  assignedToday: number;
  sentCount: number;
  viewedCount: number;
  hotCount: number;
  repliedCount: number;
  convertedCount: number;
};

const EMPTY_DATA = STAGES.reduce((acc, stage) => {
  acc[stage] = { count: 0, leads: [] };
  return acc;
}, {} as KanbanData);

const EMPTY_MESSAGES: Record<LeadStage, string> = {
  ready: "Chưa có lead\nGiao việc chưa chạy hôm nay",
  sent: "Chưa gửi DM nào",
  viewed: "Chưa có lead xem demo",
  hot: "Chưa có lead quan tâm",
  replied: "Chưa có lead phản hồi",
  converted: "Chưa có chuyển đổi",
  signedup: "Trống",
  onboarding: "Trống",
  trial: "Trống",
  ghosted: "Trống",
  churned: "Trống",
};

function daysAgo(iso: string | undefined) {
  if (!iso) return "Không có";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
  if (diff === 0) return "hôm nay";
  if (diff === 1) return "1 ngày trước";
  return `${diff} ngày trước`;
}

function relativeVi(iso: string | undefined) {
  if (!iso) return "";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
  if (diff === 0) return "hôm nay";
  if (diff === 1) return "hôm qua";
  return `${diff} ngày trước`;
}

function pct(numerator: number, denominator: number) {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function stageBorder(stage: LeadStage) {
  switch (stage) {
    case "hot":
      return "0.5px solid #F59E0B";
    case "replied":
      return "0.5px solid #10B981";
    case "converted":
      return "0.5px solid #7C3AED";
    default:
      return "0.5px solid var(--color-border-tertiary, var(--color-border))";
  }
}

function demoLine(lead: KanbanLead) {
  if (lead.stage === "converted") {
    return (
      <span className="inline-flex items-center gap-1">
        <CheckCircle className="h-3 w-3" />
        Đã chuyển đổi
      </span>
    );
  }

  if (lead.stage === "replied") return `Phản hồi ${relativeVi(lead.updated_at ?? lead.updatedAt)}`;

  if ((lead.demo?.plays ?? 0) > 0) {
    return (
      <span className="inline-flex items-center gap-1">
        <Play className="h-3 w-3" />
        {lead.demo?.plays} lượt xem · {lead.demo?.pct ?? 0}%
      </span>
    );
  }

  if (lead.stage === "ready" || lead.stage === "sent") return "Chưa có lượt xem";
  return "Chưa có lượt xem";
}

function LeadCard({
  lead,
  onSelectLead,
}: {
  lead: KanbanLead;
  onSelectLead: (lead: PipelineLead) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectLead(lead)}
      style={{ border: stageBorder(lead.stage) }}
      className="w-full rounded-md bg-background p-3 text-left transition-colors hover:bg-surface-muted"
    >
      <div className="truncate text-xs font-medium text-text">{lead.name}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted">{lead.location}</div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
        <span>{demoLine(lead)}</span>
        <span>{daysAgo(lead.updated_at ?? lead.updatedAt)}</span>
      </div>
      {lead.assignedRepName ? (
        <div className="mt-1 truncate text-xs text-muted">Đã giao: {lead.assignedRepName}</div>
      ) : null}
    </button>
  );
}

function ColumnSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-md bg-surface-muted" />
      ))}
    </div>
  );
}

function isAdminMyDayData(data: any) {
  return (
    typeof data?.waitingDemo?.count === "number" &&
    typeof data?.readyToAssign?.count === "number" &&
    typeof data?.assignedToday?.count === "number"
  );
}

function AdminSummaryStrip({ summary }: { summary: PipelineSummary | null }) {
  if (!summary) return null;

  const items = [
    { label: "Kho chờ demo", value: summary.waitingDemo },
    { label: "Sẵn sàng giao", value: summary.readyToAssign },
    { label: "Đã giao hôm nay", value: summary.assignedToday },
    { label: "Đang xử lý", value: summary.active },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-muted px-4 py-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-medium text-muted">{item.label}:</span>
          <span className="text-sm font-semibold text-[#7C3AED]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function OutreacherSummaryStrip({ summary }: { summary: OutreacherSummary | null }) {
  if (!summary) return null;

  const items = [
    {
      label: "Được giao",
      value: summary.totalAssigned,
      detail: `+${summary.assignedToday} hôm nay`,
      color: "#7C3AED",
    },
    {
      label: "Đã gửi DM",
      value: summary.sentCount,
      detail: `${pct(summary.sentCount, summary.totalAssigned)} tổng được giao`,
      color: "var(--color-text-primary, var(--color-text))",
    },
    {
      label: "Xem demo",
      value: summary.viewedCount,
      detail: `${pct(summary.viewedCount, summary.sentCount)} đã gửi`,
      color: "var(--color-text-primary, var(--color-text))",
    },
    {
      label: "Quan tâm cao",
      value: summary.hotCount,
      detail: summary.hotCount > 0 ? "follow up ngay" : "chưa có",
      color: "#D97706",
    },
    {
      label: "Đã phản hồi",
      value: summary.repliedCount,
      detail: summary.repliedCount > 0 ? "đang trao đổi" : "chưa có",
      color: "#059669",
    },
    {
      label: "Đã chuyển đổi",
      value: summary.convertedCount,
      detail: "tất cả",
      color: "#7C3AED",
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-md p-3"
          style={{
            background: "var(--color-background-secondary, var(--color-surface-muted))",
            borderRadius: "var(--border-radius-md, 6px)",
          }}
        >
          <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
            {item.label}
          </div>
          <div className="mt-1 text-[22px] font-medium leading-none" style={{ color: item.color }}>
            {item.value}
          </div>
          <div className="mt-1 text-[11px] text-muted">{item.detail}</div>
        </div>
      ))}
    </div>
  );
}

export function KanbanBoard({
  onSelectLead,
  onViewMore,
  reloadSignal = 0,
  isAdmin,
}: {
  onSelectLead: (lead: PipelineLead) => void;
  onViewMore: (stage: LeadStage) => void;
  reloadSignal?: number;
  isAdmin: boolean;
}) {
  const [data, setData] = useState<KanbanData>(EMPTY_DATA);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [outreacherSummary, setOutreacherSummary] = useState<OutreacherSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [kanbanRes, myDayRes] = await Promise.all([
          fetch("/api/sales/kanban"),
          isAdmin ? fetch("/api/sales/my-day") : Promise.resolve(null),
        ]);
        const kanbanJson = kanbanRes.ok ? await kanbanRes.json() : null;
        const myDayJson = myDayRes?.ok ? await myDayRes.json() : null;
        const nextData = kanbanJson?.data ?? EMPTY_DATA;

        if (!cancelled) {
          setData(nextData);
          if (isAdmin && isAdminMyDayData(myDayJson?.data)) {
            setSummary({
              waitingDemo: myDayJson.data.waitingDemo.count,
              readyToAssign: myDayJson.data.readyToAssign.count,
              assignedToday: myDayJson.data.assignedToday.count,
              active: ACTIVE_STAGES.reduce((sum, stage) => sum + (nextData[stage]?.count ?? 0), 0),
            });
          } else {
            setSummary(null);
          }
          setOutreacherSummary(!isAdmin ? kanbanJson?.data?.summary ?? null : null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, reloadSignal]);

  return (
    <div className="space-y-3">
      {isAdmin ? (
        <AdminSummaryStrip summary={summary} />
      ) : (
        <OutreacherSummaryStrip summary={outreacherSummary} />
      )}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {STAGES.map((stage) => {
            const group = data[stage] ?? EMPTY_DATA[stage];
            const hidden = Math.max(0, group.count - group.leads.length);
            const meta = STAGE_META[stage];

            return (
              <section key={stage} className="w-[260px] shrink-0 rounded-lg border border-border bg-surface">
                <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${meta.dotColor}`} />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {meta.label}
                    </span>
                  </div>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text">
                    {group.count}
                  </span>
                </div>
                {loading ? (
                  <ColumnSkeleton />
                ) : (
                  <div className="space-y-2 p-3">
                    {group.leads.length === 0 ? (
                      <div className="whitespace-pre-line rounded-md border border-dashed border-border px-2 py-5 text-center text-xs text-muted">
                        {EMPTY_MESSAGES[stage]}
                      </div>
                    ) : (
                      group.leads.map((lead) => (
                        <LeadCard key={lead.id} lead={lead} onSelectLead={onSelectLead} />
                      ))
                    )}
                    {hidden > 0 ? (
                      <button
                        type="button"
                        onClick={() => onViewMore(stage)}
                        className="w-full rounded-md border border-border px-3 py-2 text-center text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-text"
                      >
                        + {hidden} thêm
                      </button>
                    ) : null}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
