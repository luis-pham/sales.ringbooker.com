"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Flame, RefreshCw, Send } from "lucide-react";
import { StageBadge } from "./StageBadge";
import { getNextAction } from "@/lib/getNextAction";
import type { PipelineLead, LeadStage } from "@/types";

const INBOX_ORDER: LeadStage[] = [
  "hot", "viewed", "replied", "sent", "onboarding", "trial",
  "signedup", "ghosted", "ready",
];

function stageRank(stage: LeadStage): number {
  const idx = INBOX_ORDER.indexOf(stage);
  return idx === -1 ? 99 : idx;
}

function isFreshDemoView(lead: PipelineLead): boolean {
  // Highlight leads whose demo was seen in the last 2 hours.
  if (!lead.demo?.lastSeen) return false;
  return Date.now() - new Date(lead.demo.lastSeen).getTime() < 2 * 60 * 60 * 1000;
}

function LeadRow({
  lead,
  onSelect,
  accent,
}: {
  lead: PipelineLead;
  onSelect: (l: PipelineLead) => void;
  accent: "red" | "amber" | "emerald";
}) {
  const action = getNextAction(lead);
  const bar = accent === "red" ? "bg-red-500" : accent === "amber" ? "bg-amber-500" : "bg-emerald-500";
  const dueColor = accent === "red" ? "text-red-600" : accent === "amber" ? "text-amber-600" : "text-emerald-600";
  const fresh = isFreshDemoView(lead);

  return (
    <button
      onClick={() => onSelect(lead)}
      className="flex w-full items-stretch gap-3 rounded-lg border border-border bg-surface p-3 text-left hover:bg-surface-muted transition-colors"
    >
      <div className={`w-1 shrink-0 rounded-full ${bar}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 truncate text-sm font-medium text-text">
            {fresh && <Flame className="h-3.5 w-3.5 shrink-0 text-red-500" />}
            {lead.name}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <StageBadge stage={lead.stage} />
            <a
              href={`/leads/${lead.id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Mở trang đầy đủ"
              className="text-muted hover:text-violet-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
        <div className="mt-0.5 text-xs text-muted">
          {fresh ? "🔥 Vừa xem demo — liên hệ ngay" : action.title}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted">
          <span>{lead.location}</span>
          {lead.demo && <span>{lead.demo.plays}× · {lead.demo.pct}%</span>}
          <span className={`font-medium ${dueColor}`}>{action.due}</span>
        </div>
      </div>
    </button>
  );
}

function Section({
  icon,
  title,
  count,
  color,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  color: string;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2 px-1">
        <span className={color}>{icon}</span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        <span className="text-xs text-muted">({count})</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

export function LeadInbox({
  leads,
  onSelectLead,
  showQuota = true,
}: {
  leads: PipelineLead[];
  onSelectLead: (lead: PipelineLead) => void;
  showQuota?: boolean;
}) {
  const [quota, setQuota] = useState<{ sentToday: number; target: number } | null>(null);

  useEffect(() => {
    if (!showQuota) return;
    fetch("/api/sales/quota")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setQuota(j.data))
      .catch(() => null);
  }, [leads, showQuota]);

  const inbox = leads.filter((l) => l.stage !== "converted" && l.stage !== "churned");

  // 3 buckets: urgent → follow-up → new DMs (fresh ready batch).
  const urgent = inbox
    .filter((l) => getNextAction(l).urgency === "urgent")
    .sort((a, b) => stageRank(a.stage) - stageRank(b.stage));
  const newDM = inbox.filter((l) => l.stage === "ready");
  const followUp = inbox
    .filter((l) => getNextAction(l).urgency !== "urgent" && l.stage !== "ready")
    .sort((a, b) => stageRank(a.stage) - stageRank(b.stage));

  const pct = quota && quota.target > 0 ? Math.min(100, Math.round((quota.sentToday / quota.target) * 100)) : 0;
  const quotaDone = quota != null && quota.sentToday >= quota.target;

  return (
    <div className="space-y-5">
      {/* Daily quota bar */}
      {showQuota && quota && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-text">DM hôm nay</span>
            <span className={quotaDone ? "font-semibold text-emerald-600" : "text-muted"}>
              {quotaDone ? "Đã đạt chỉ tiêu 🎉" : `${quota.sentToday}/${quota.target}`}
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className={`h-full rounded-full transition-all ${quotaDone ? "bg-emerald-500" : "bg-violet-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Done state */}
      {inbox.length === 0 && (
        <div className="rounded-lg border border-border bg-surface py-12 text-center">
          <div className="text-2xl">🎉</div>
          <div className="mt-2 text-sm font-medium text-text">Hôm nay xong rồi!</div>
          <div className="mt-0.5 text-xs text-muted">Không còn lead cần xử lý.</div>
        </div>
      )}

      <Section icon={<Flame className="h-4 w-4" />} title="Làm ngay" count={urgent.length} color="text-red-500">
        {urgent.map((lead) => (
          <LeadRow key={lead.id} lead={lead} onSelect={onSelectLead} accent="red" />
        ))}
      </Section>

      <Section icon={<RefreshCw className="h-4 w-4" />} title="Theo dõi lại" count={followUp.length} color="text-amber-500">
        {followUp.map((lead) => (
          <LeadRow key={lead.id} lead={lead} onSelect={onSelectLead} accent="amber" />
        ))}
      </Section>

      <Section icon={<Send className="h-4 w-4" />} title="DM mới hôm nay" count={newDM.length} color="text-emerald-500">
        {newDM.map((lead) => (
          <LeadRow key={lead.id} lead={lead} onSelect={onSelectLead} accent="emerald" />
        ))}
      </Section>
    </div>
  );
}
