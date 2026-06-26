"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { StageBadge } from "./StageBadge";
import { BulkActionsBar } from "./BulkActionsBar";
import { DMTemplateModal } from "./DMTemplateModal";
import { STAGE_ORDER, STAGE_META } from "@/lib/stageConfig";
import { getNextAction } from "@/lib/getNextAction";
import type { PipelineLead, LeadStage } from "@/types";

const PER_PAGE = 50;

const STAGE_FILTERS: Array<{ value: LeadStage | "all"; label: string }> = [
  { value: "all", label: "Tất cả" },
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

/**
 * All Leads table — self-fetches with server-side pagination + stage/search filter,
 * so it browses the WHOLE table (not the 200-row My Day/Kanban fetch).
 * `reloadSignal` bumps when a lead is edited elsewhere (panel) to trigger a refetch.
 */
export function LeadTable({
  onSelectLead,
  reloadSignal = 0,
  assignee,
  initialStageFilter = "all",
}: {
  onSelectLead: (lead: PipelineLead) => void;
  reloadSignal?: number;
  assignee?: string;
  initialStageFilter?: LeadStage | "all";
}) {
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stageFilter, setStageFilter] = useState<LeadStage | "all">(initialStageFilter);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dmLeads, setDmLeads] = useState<PipelineLead[] | null>(null);
  const [localReload, setLocalReload] = useState(0);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when filters change.
  useEffect(() => { setPage(1); }, [stageFilter, debounced, assignee]);

  useEffect(() => {
    setStageFilter(initialStageFilter);
  }, [initialStageFilter]);

  // Fetch.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
    if (stageFilter !== "all") params.set("stage", stageFilter);
    if (debounced) params.set("q", debounced);
    if (assignee) params.set("assignee", assignee);

    fetch(`/api/sales/leads?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : { data: [], total: 0 }))
      .then((j: { data: PipelineLead[]; total?: number }) => {
        if (cancelled) return;
        setLeads(j.data ?? []);
        setTotal(j.total ?? 0);
        setSelected(new Set());
      })
      .finally(() => !cancelled && setLoading(false));

    return () => { cancelled = true; };
  }, [page, stageFilter, debounced, assignee, reloadSignal, localReload]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(leads.map((l) => l.id)) : new Set());
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
    await Promise.all(
      selectedLeads.map((l) =>
        fetch(`/api/leads/${l.id}/stage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: "ghosted" }),
        }),
      ),
    );
    setSelected(new Set());
    setLocalReload((n) => n + 1); // refetch current page
  }

  return (
    <div className="space-y-3">
      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Tìm tên doanh nghiệp…"
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
                  checked={selected.size === leads.length && leads.length > 0}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="rounded"
                />
              </th>
              <th className="px-3 py-3">Doanh nghiệp</th>
              <th className="px-3 py-3">Địa điểm</th>
              <th className="px-3 py-3">Giai đoạn</th>
              <th className="px-3 py-3">Demo</th>
              <th className="px-3 py-3">Hành động tiếp theo</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">Đang tải…</td></tr>
            )}
            {!loading && leads.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">Không có lead phù hợp.</td></tr>
            )}
            {!loading && leads.map((lead) => {
              const action = getNextAction(lead);
              return (
                <tr
                  key={lead.id}
                  className="group border-b border-border last:border-0 hover:bg-surface-muted cursor-pointer"
                  onClick={() => onSelectLead(lead)}
                >
                  <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-text">{lead.name}</span>
                      <a
                        href={`/leads/${lead.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Mở trang đầy đủ"
                        className="shrink-0 text-muted opacity-0 group-hover:opacity-100 hover:text-violet-700"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                      </a>
                    </div>
                    {lead.handle && <div className="text-xs text-muted">{lead.handle}</div>}
                  </td>
                  <td className="px-3 py-3 text-muted">{lead.location}</td>
                  <td className="px-3 py-3"><StageBadge stage={lead.stage} /></td>
                  <td className="px-3 py-3">
                    {lead.demo ? (
                      <div className="flex items-center gap-2">
                        <DemoDot plays={lead.demo.plays} pct={lead.demo.pct} />
                        <span className="text-muted">{lead.demo.plays}× · {lead.demo.pct}%</span>
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

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{total} Lead · trang {page}/{totalPages}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-surface-muted disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Trước
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-surface-muted disabled:opacity-40"
          >
            Sau <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {dmLeads && <DMTemplateModal leads={dmLeads} onClose={() => setDmLeads(null)} />}
    </div>
  );
}
