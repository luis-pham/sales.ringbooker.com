"use client";

import { ExternalLink, Ghost, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StageBadge } from "./StageBadge";
import { DemoTrackingBlock } from "./DemoTrackingBlock";
import { NextActionBlock } from "./NextActionBlock";
import { TimelineBlock } from "./TimelineBlock";
import { useDemoTracking } from "@/hooks/useDemoTracking";
import { getNextAction } from "@/lib/getNextAction";
import { STAGE_META, nextFunnelStage } from "@/lib/stageConfig";
import type { PipelineLead, LeadStage, TimelineEvent } from "@/types";

const HIDE_GHOSTED_FOR: LeadStage[] = ["converted", "ghosted", "churned"];

export function LeadPanel({
  lead,
  onClose,
  onUpdateStage,
  onAddNote,
}: {
  lead: PipelineLead;
  onClose: () => void;
  onUpdateStage: (id: string, stage: LeadStage) => Promise<void>;
  onAddNote: (id: string, type: TimelineEvent["type"], text: string) => Promise<void>;
}) {
  const { tracking, isLoading: demoLoading } = useDemoTracking(lead.id);
  const enrichedLead = tracking ? { ...lead, demo: tracking } : lead;
  const action = getNextAction(enrichedLead);
  const fwdStage = nextFunnelStage(lead.stage);

  async function handleMarkDone() {
    await onAddNote(lead.id, "note", `Done: ${action.title}`);
  }

  const platformUrl =
    lead.platform === "Instagram" && lead.handle
      ? `https://instagram.com/${lead.handle.replace("@", "")}`
      : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 dark:bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-[var(--shadow-modal)]">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-text">{lead.name}</h2>
              <StageBadge stage={lead.stage} />
            </div>
            <div className="mt-0.5 text-sm text-muted">
              {lead.location}
              {lead.businessType ? ` · ${lead.businessType}` : ""}
            </div>
            {lead.handle && (
              <div className="mt-0.5 text-xs text-muted">
                {lead.platform} · {lead.handle}
                {lead.followers ? ` · ${lead.followers} followers` : ""}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Demo tracking */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Demo Tracking
            </h3>
            <DemoTrackingBlock tracking={tracking} isLoading={demoLoading} />
          </section>

          {/* Next action */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Next Action
            </h3>
            <NextActionBlock action={action} onMarkDone={handleMarkDone} />
          </section>

          {/* Timeline */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Timeline
            </h3>
            <TimelineBlock
              events={lead.timeline}
              onAddNote={(text) => onAddNote(lead.id, "note", text)}
            />
          </section>
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-border p-4 space-y-2">
          <div className="flex items-center gap-2">
            {fwdStage && (
              <Button
                size="sm"
                className="flex-1"
                onClick={() => onUpdateStage(lead.id, fwdStage)}
              >
                → {STAGE_META[fwdStage].label}
              </Button>
            )}
            {platformUrl && (
              <a href={platformUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Open {lead.platform} DM
                </Button>
              </a>
            )}
          </div>
          {!HIDE_GHOSTED_FOR.includes(lead.stage) && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted"
              onClick={() => onUpdateStage(lead.id, "ghosted")}
            >
              <Ghost className="mr-1.5 h-3.5 w-3.5" />
              Mark as ghosted
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
