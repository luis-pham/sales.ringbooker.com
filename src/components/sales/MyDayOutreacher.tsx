"use client";

import { useEffect, useState } from "react";
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
  doNow: Group;
  followUp: Group;
  newDMs: Group;
};

type Quota = {
  sentToday: number;
  target: number;
};

const EMPTY_DATA: MyDayData = {
  doNow: { count: 0, leads: [] },
  followUp: { count: 0, leads: [] },
  newDMs: { count: 0, leads: [] },
};

function QuotaBar({ quota }: { quota: Quota | null }) {
  const sent = quota?.sentToday ?? 0;
  const target = quota?.target ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((sent / target) * 100)) : 0;

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
        <span>Quota</span>
        <span className="text-text">{sent}/{target} DMs today</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-violet-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

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
  onToggle,
  onSelectLead,
}: {
  id: keyof MyDayData;
  label: string;
  group: Group;
  open: boolean;
  onToggle: () => void;
  onSelectLead: (lead: PipelineLead) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-text">{label}</span>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text">
          {group.count}
        </span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border p-3">
          {group.leads.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
              Empty
            </div>
          ) : (
            group.leads.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                urgent={id === "doNow"}
                onSelectLead={onSelectLead}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

export function MyDayOutreacher({
  onSelectLead,
  reloadSignal = 0,
}: {
  onSelectLead: (lead: PipelineLead) => void;
  reloadSignal?: number;
}) {
  const [data, setData] = useState<MyDayData>(EMPTY_DATA);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<keyof MyDayData, boolean>>({
    doNow: false,
    followUp: false,
    newDMs: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [myDayRes, quotaRes] = await Promise.all([
          fetch("/api/sales/my-day"),
          fetch("/api/sales/quota"),
        ]);
        const [myDayJson, quotaJson] = await Promise.all([
          myDayRes.ok ? myDayRes.json() : null,
          quotaRes.ok ? quotaRes.json() : null,
        ]);
        if (cancelled) return;
        const next = myDayJson?.data ?? EMPTY_DATA;
        setData(next);
        setQuota(quotaJson?.data ?? null);
        setOpen((prev) => ({ ...prev, doNow: next.doNow.count > 0 }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadSignal]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-lg bg-surface-muted" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <QuotaBar quota={quota} />
      <GroupSection
        id="doNow"
        label="🔴 Do now"
        group={data.doNow}
        open={open.doNow}
        onToggle={() => setOpen((prev) => ({ ...prev, doNow: !prev.doNow }))}
        onSelectLead={onSelectLead}
      />
      <GroupSection
        id="followUp"
        label="🟡 Follow up"
        group={data.followUp}
        open={open.followUp}
        onToggle={() => setOpen((prev) => ({ ...prev, followUp: !prev.followUp }))}
        onSelectLead={onSelectLead}
      />
      <GroupSection
        id="newDMs"
        label="🟢 Send new DMs"
        group={data.newDMs}
        open={open.newDMs}
        onToggle={() => setOpen((prev) => ({ ...prev, newDMs: !prev.newDMs }))}
        onSelectLead={onSelectLead}
      />
    </div>
  );
}
