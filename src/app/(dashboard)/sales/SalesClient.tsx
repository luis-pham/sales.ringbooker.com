"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ElementType } from "react";
import { BarChart3, Inbox, List } from "lucide-react";
import { KanbanBoard } from "@/components/sales/KanbanBoard";
import { LeadTable } from "@/components/sales/LeadTable";
import { MyDayAdmin } from "@/components/sales/MyDayAdmin";
import { MyDayOutreacher } from "@/components/sales/MyDayOutreacher";
import { STAGE_META, STAGE_ORDER } from "@/lib/stageConfig";
import type { LeadStage, PipelineLead, Profile, TimelineEvent, UserRole } from "@/types";

const LeadPanel = dynamic(() => import("@/components/sales/LeadPanel").then((mod) => mod.LeadPanel), {
  ssr: false,
  loading: () => null,
});

type Tab = "pipeline" | "my-day" | "all-leads";
type SalesStats = { byStage: Record<string, number>; total: number };
type TeamProfile = Pick<Profile, "id" | "email" | "full_name" | "role" | "is_active">;

function SummaryStrip({ stats }: { stats: SalesStats | null }) {
  if (!stats) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">Pipeline</span>
      <span className="text-sm font-semibold text-text">{stats.total} total</span>
      <span className="text-border">·</span>
      {STAGE_ORDER.map((stage) => {
        const n = stats.byStage[stage] ?? 0;
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

export function SalesClient({ role }: { role: UserRole }) {
  const isAdmin = role === "admin";
  const [tab, setTab] = useState<Tab>(isAdmin ? "pipeline" : "my-day");
  const [selectedLead, setSelectedLead] = useState<PipelineLead | null>(null);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [team, setTeam] = useState<TeamProfile[]>([]);
  const [assignee, setAssignee] = useState("all");
  const [allLeadsStage, setAllLeadsStage] = useState<LeadStage | "all">("all");

  useEffect(() => {
    fetch("/api/sales/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setStats(j.data))
      .catch(() => null);
  }, [reloadSignal]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/team")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const profiles: TeamProfile[] = j?.data?.profiles ?? [];
        setTeam(profiles.filter((p) => p.role === "outreacher" && p.is_active));
      })
      .catch(() => null);
  }, [isAdmin]);

  async function handleUpdateStage(id: string, stage: LeadStage) {
    const res = await fetch(`/api/leads/${id}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) return;
    setSelectedLead((prev) => (prev?.id === id ? { ...prev, stage } : prev));
    setReloadSignal((n) => n + 1);
  }

  async function handleAddNote(id: string, type: TimelineEvent["type"], text: string) {
    const res = await fetch(`/api/leads/${id}/timeline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, text }),
    });
    if (!res.ok) return;
    const json = (await res.json()) as { data: { id: string; created_at: string } };
    setSelectedLead((prev) =>
      prev?.id === id
        ? {
            ...prev,
            timeline: [
              ...prev.timeline,
              { id: json.data.id, type, text, date: json.data.created_at },
            ],
          }
        : prev,
    );
  }

  function handleChanged(stage: LeadStage) {
    setSelectedLead((prev) => (prev ? { ...prev, stage } : prev));
    setReloadSignal((n) => n + 1);
  }

  function handleViewMore(stage: LeadStage) {
    setAllLeadsStage(stage);
    setTab("all-leads");
  }

  const tabs: Array<{ id: Tab; label: string; icon: ElementType }> = isAdmin
    ? [
        { id: "pipeline", label: "Pipeline", icon: BarChart3 },
        { id: "my-day", label: "My Day", icon: Inbox },
        { id: "all-leads", label: "All Leads", icon: List },
      ]
    : [
        { id: "my-day", label: "My Day", icon: Inbox },
        { id: "all-leads", label: "All Leads", icon: List },
        { id: "pipeline", label: "Pipeline", icon: BarChart3 },
      ];

  return (
    <div className="space-y-5">
      {isAdmin && <SummaryStrip stats={stats} />}

      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              if (id === "all-leads") setAllLeadsStage("all");
              setTab(id);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === id
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "pipeline" && (
        <KanbanBoard
          onSelectLead={setSelectedLead}
          onViewMore={handleViewMore}
          reloadSignal={reloadSignal}
        />
      )}

      {tab === "my-day" && (
        isAdmin ? (
          <MyDayAdmin onSelectLead={setSelectedLead} reloadSignal={reloadSignal} />
        ) : (
          <MyDayOutreacher onSelectLead={setSelectedLead} reloadSignal={reloadSignal} />
        )
      )}

      {tab === "all-leads" && (
        <div className="space-y-3">
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Assignee</span>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-violet-300 dark:focus:ring-violet-700"
              >
                <option value="all">All outreachers</option>
                {team.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name || member.email}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <LeadTable
            onSelectLead={setSelectedLead}
            reloadSignal={reloadSignal}
            assignee={isAdmin && assignee !== "all" ? assignee : undefined}
            initialStageFilter={allLeadsStage}
          />
        </div>
      )}

      {selectedLead && (
        <LeadPanel
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdateStage={handleUpdateStage}
          onAddNote={handleAddNote}
          onChanged={handleChanged}
        />
      )}
    </div>
  );
}
