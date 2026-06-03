"use client";

import { useState } from "react";
import { StageBadge } from "./StageBadge";
import { BulkActionsBar } from "./BulkActionsBar";
import { DMTemplateModal } from "./DMTemplateModal";
import { STAGE_ORDER, STAGE_META, URGENCY_DOT } from "@/lib/stageConfig";
import { getNextAction } from "@/lib/getNextAction";
import type { PipelineLead, LeadStage } from "@/types";

const STAGE_FILTERS: Array<{ value: LeadStage | "all"; label: string }> = [
  { value: "all", label: "All" },
  ...STAGE_ORDER.map((s) => ({ value: s, label: STAGE_META[s].label })),
];

function DemoDot({ plays, pct }: { plays: number; pct: number }) {
  const cls = plays >= 2 || pct >= 80
    ? "bg-red-500"
    : plays >= 1 || pct >= 30
    ? "bg-amber-500"
    : "bg-emerald-500";
  return <div className={`h-2 w-2 rounded-full shrink-0 ${cls}`} />;
}

export function LeadTable({
  leads,
  onSelectLead,
  onUpdateStage,
}: {
  leads: PipelineLead[];
  onSelectLead: (lead: PipelineLead) => void;
  onUpdateStage: (id: string, stage: LeadStage) => Promise<void>;
}) {
  const [stageFilter, setStageFilter] = useState<LeadStage | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dmLeads, setDmLeads] = useState<PipelineLead[] | null>(null);

  const filtered = leads.filter((l) => {
    if (stageFilter !== "all" && l.stage !== stageFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.name.toLowerCase().includes(q) && !(l.handle ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(filtered.map((l) => l.id)) : new Set());
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectedLeads = leads.filter((l) => selected.has(l.id));

  async function handleMarkGhosted() {
    await Promise.all(selectedLeads.map((l) => onUpdateStage(l.id, "ghosted")));
    setSelected(new Set());
  }

  return (
    <div className="space-y-3">
      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search name or handle…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-violet-300 dark:focus:ring-violet-700"
        />
        <div className="flex flex-wrap gap-1">
          {STAGE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStageFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                stageFilter === f.value
                  ? "bg-violet-600 text-white"
                  : "border border-border bg-surface text-muted hover:text-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions */}
      <BulkActionsBar
        count={selected.size}
        onCopyDM={() => setDmLeads(selectedLeads)}
        onMarkGhosted={handleMarkGhosted}
        onClear={() => setSelected(new Set())}
      />

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="rounded"
                />
              </th>
              <th className="px-3 py-3">Business</th>
              <th className="px-3 py-3">Location</th>
              <th className="px-3 py-3">Stage</th>
              <th className="px-3 py-3">Demo</th>
              <th className="px-3 py-3">Next action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                  No leads match filters.
                </td>
              </tr>
            )}
            {filtered.map((lead) => {
              const action = getNextAction(lead);
              return (
                <tr
                  key={lead.id}
                  className="border-b border-border last:border-0 hover:bg-surface-muted cursor-pointer"
                  onClick={() => onSelectLead(lead)}
                >
                  <td
                    className="px-3 py-3 w-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-text">{lead.name}</div>
                    {lead.handle && <div className="text-xs text-muted">{lead.handle}</div>}
                  </td>
                  <td className="px-3 py-3 text-muted">{lead.location}</td>
                  <td className="px-3 py-3">
                    <StageBadge stage={lead.stage} />
                  </td>
                  <td className="px-3 py-3">
                    {lead.demo ? (
                      <div className="flex items-center gap-2">
                        <DemoDot plays={lead.demo.plays} pct={lead.demo.pct} />
                        <span className="text-muted">
                          {lead.demo.plays}× · {lead.demo.pct}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${
                        action.urgency === "urgent" ? "bg-red-500"
                        : action.urgency === "soon" ? "bg-amber-500"
                        : "bg-emerald-500"
                      }`} />
                      <span className="text-xs text-muted truncate max-w-[140px]">{action.title}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dmLeads && (
        <DMTemplateModal leads={dmLeads} onClose={() => setDmLeads(null)} />
      )}
    </div>
  );
}
