"use client";

import { useState } from "react";
import { KanbanSquare, List, Inbox } from "lucide-react";
import { LeadInbox } from "@/components/sales/LeadInbox";
import { LeadTable } from "@/components/sales/LeadTable";
import { LeadPanel } from "@/components/sales/LeadPanel";
import { useLeads } from "@/hooks/useLeads";
import { getNextAction } from "@/lib/getNextAction";
import type { PipelineLead, LeadStage, TimelineEvent, UserRole } from "@/types";

// Inline mini-kanban to avoid breaking existing PipelineClient
import { STAGE_META, STAGE_ORDER } from "@/lib/stageConfig";
import { StageBadge } from "@/components/sales/StageBadge";

type Tab = "today" | "all" | "kanban";

const KANBAN_STAGES: LeadStage[] = ["ready", "sent", "viewed", "hot", "replied", "converted"];

/** Compact per-stage count strip — admin's at-a-glance pipeline summary. */
function SummaryStrip({ leads }: { leads: PipelineLead[] }) {
  const counts = new Map<LeadStage, number>();
  for (const l of leads) counts.set(l.stage, (counts.get(l.stage) ?? 0) + 1);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">Pipeline</span>
      <span className="text-sm font-semibold text-text">{leads.length} total</span>
      <span className="text-border">·</span>
      {STAGE_ORDER.map((stage) => {
        const n = counts.get(stage) ?? 0;
        if (n === 0) return null;
        return (
          <span key={stage} className="flex items-center gap-1 text-xs text-muted">
            <span className={`h-2 w-2 rounded-full ${STAGE_META[stage].dotColor}`} />
            {STAGE_META[stage].label} <span className="font-medium text-text">{n}</span>
          </span>
        );
      })}
    </div>
  );
}

function MiniKanban({
  leads,
  onSelect,
}: {
  leads: PipelineLead[];
  onSelect: (l: PipelineLead) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-6 md:grid-cols-3 grid-cols-2">
      {KANBAN_STAGES.map((stage) => {
        const rows = leads.filter((l) => l.stage === stage);
        const meta = STAGE_META[stage];
        return (
          <div key={stage} className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                {meta.label}
              </span>
              <span className="text-xs text-muted">{rows.length}</span>
            </div>
            <div className="space-y-2 p-2">
              {rows.slice(0, 8).map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => onSelect(lead)}
                  className="w-full rounded border border-border p-2 text-left hover:bg-surface-muted transition-colors"
                >
                  <div className="text-xs font-medium text-text truncate">{lead.name}</div>
                  <div className="mt-0.5 text-xs text-muted truncate">{lead.location}</div>
                </button>
              ))}
              {rows.length === 0 && (
                <div className="py-2 text-center text-xs text-muted">Empty</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SalesClient({ role }: { role: UserRole }) {
  const isAdmin = role === "admin";
  const { leads, isLoading, updateLeadStage, addTimelineEvent, refetch } = useLeads();
  // Admin lands on the pipeline overview (Kanban); reps land on their action queue.
  const [tab, setTab] = useState<Tab>(isAdmin ? "kanban" : "today");
  const [activePanel, setActivePanel] = useState<PipelineLead | null>(null);

  const urgentCount = leads.filter(
    (l) => l.stage !== "converted" && l.stage !== "churned"
      && getNextAction(l).urgency === "urgent",
  ).length;

  function openPanel(lead: PipelineLead) {
    setActivePanel(lead);
    if (tab === "today") setTab("all");
  }

  async function handleUpdateStage(id: string, stage: LeadStage) {
    await updateLeadStage(id, stage);
    if (activePanel?.id === id) {
      setActivePanel((prev) => prev ? { ...prev, stage } : null);
    }
  }

  async function handleAddNote(id: string, type: TimelineEvent["type"], text: string) {
    await addTimelineEvent(id, type, text);
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType; badge?: number }> = [
    { id: "today",  label: "My Day",    icon: Inbox,        badge: urgentCount || undefined },
    { id: "all",    label: "All Leads", icon: List },
    { id: "kanban", label: "Kanban",    icon: KanbanSquare },
  ];

  return (
    <div className="space-y-5">
      {/* Admin pipeline summary */}
      {isAdmin && !isLoading && <SummaryStrip leads={leads} />}

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === id
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {badge ? (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white leading-none">
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 w-full animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      )}

      {/* Tab content */}
      {!isLoading && (
        <>
          {tab === "today" && (
            <LeadInbox leads={leads} onSelectLead={openPanel} showQuota={!isAdmin} />
          )}
          {tab === "all" && (
            <LeadTable
              leads={leads}
              onSelectLead={setActivePanel}
              onUpdateStage={handleUpdateStage}
            />
          )}
          {tab === "kanban" && (
            <MiniKanban leads={leads} onSelect={setActivePanel} />
          )}
        </>
      )}

      {/* Side panel */}
      {activePanel && (
        <LeadPanel
          lead={activePanel}
          onClose={() => setActivePanel(null)}
          onUpdateStage={handleUpdateStage}
          onAddNote={handleAddNote}
        />
      )}
    </div>
  );
}
