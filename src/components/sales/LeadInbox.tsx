"use client";

import { ExternalLink } from "lucide-react";
import { StageBadge } from "./StageBadge";
import { URGENCY_COLOR } from "@/lib/stageConfig";
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

export function LeadInbox({
  leads,
  onSelectLead,
}: {
  leads: PipelineLead[];
  onSelectLead: (lead: PipelineLead) => void;
}) {
  const inbox = leads
    .filter((l) => l.stage !== "converted" && l.stage !== "churned")
    .sort((a, b) => stageRank(a.stage) - stageRank(b.stage));

  const urgentCount = inbox.filter(
    (l) => getNextAction(l).urgency === "urgent",
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">{inbox.length} leads</span>
        {urgentCount > 0 && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-medium text-white">
            {urgentCount} urgent
          </span>
        )}
      </div>

      {inbox.length === 0 && (
        <div className="py-10 text-center text-sm text-muted">
          Nothing to action — great work!
        </div>
      )}

      <div className="space-y-1.5">
        {inbox.map((lead) => {
          const action = getNextAction(lead);
          return (
            <button
              key={lead.id}
              onClick={() => onSelectLead(lead)}
              className="flex w-full items-stretch gap-3 rounded-lg border border-border bg-surface p-3 text-left hover:bg-surface-muted transition-colors"
            >
              {/* Urgency bar */}
              <div
                className={`w-1 shrink-0 rounded-full ${
                  action.urgency === "urgent"
                    ? "bg-red-500"
                    : action.urgency === "soon"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
              />

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-text">{lead.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StageBadge stage={lead.stage} />
                    <a
                      href={`/leads/${lead.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Open full page"
                      className="text-muted hover:text-violet-700"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
                <div className="mt-0.5 text-xs text-muted">{action.title}</div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                  <span>{lead.location}</span>
                  {lead.demo && (
                    <span>{lead.demo.plays}× · {lead.demo.pct}%</span>
                  )}
                  <span className={`font-medium ${
                    action.urgency === "urgent" ? "text-red-600"
                    : action.urgency === "soon" ? "text-amber-600"
                    : "text-emerald-600"
                  }`}>
                    {action.due}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
