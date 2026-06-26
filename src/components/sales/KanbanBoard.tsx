"use client";

import { useEffect, useState } from "react";
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

const EMPTY_DATA = STAGES.reduce((acc, stage) => {
  acc[stage] = { count: 0, leads: [] };
  return acc;
}, {} as KanbanData);

function daysAgo(iso: string | undefined) {
  if (!iso) return "N/A";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
  if (diff === 0) return "today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
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
      className="w-full rounded-md border border-border bg-background p-3 text-left transition-colors hover:bg-surface-muted"
    >
      <div className="truncate text-sm font-semibold text-text">{lead.name}</div>
      <div className="mt-0.5 truncate text-xs text-muted">{lead.location}</div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
        <span>{lead.demo?.plays ? `${lead.demo.plays} demo plays` : "No demo plays"}</span>
        <span>{daysAgo(lead.updated_at ?? lead.updatedAt)}</span>
      </div>
      {lead.assignedRepName ? (
        <div className="mt-1 truncate text-xs text-muted">Assigned: {lead.assignedRepName}</div>
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

export function KanbanBoard({
  onSelectLead,
  onViewMore,
  reloadSignal = 0,
}: {
  onSelectLead: (lead: PipelineLead) => void;
  onViewMore: (stage: LeadStage) => void;
  reloadSignal?: number;
}) {
  const [data, setData] = useState<KanbanData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/sales/kanban");
        const json = res.ok ? await res.json() : null;
        if (!cancelled) setData(json?.data ?? EMPTY_DATA);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadSignal]);

  return (
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
                    <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
                      Empty
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
                      + {hidden} more
                    </button>
                  ) : null}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
