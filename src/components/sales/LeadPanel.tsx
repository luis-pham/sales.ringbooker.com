"use client";

import { useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Ghost, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StageBadge } from "./StageBadge";
import { DemoTrackingBlock } from "./DemoTrackingBlock";
import { NextActionBlock } from "./NextActionBlock";
import { TimelineBlock } from "./TimelineBlock";
import { useDemoTracking } from "@/hooks/useDemoTracking";
import { getNextAction } from "@/lib/getNextAction";
import { STAGE_META, nextFunnelStage } from "@/lib/stageConfig";
import type { PipelineLead, LeadStage, TimelineEvent } from "@/types";

const HIDE_GHOSTED_FOR: LeadStage[] = ["converted", "ghosted", "churned"];

function buildDMTemplate(lead: PipelineLead): string {
  const demoLink = lead.demo?.slug
    ? `https://ringbooker.com/${lead.demo.slug}`
    : "your personalized demo link";
  return `Hey ${lead.name}! 👋\n\nI noticed you don't have an online booking system yet — I built something that lets salons like yours take bookings 24/7 without lifting a finger.\n\nI put together a quick demo just for you: ${demoLink}\n\nTakes 2 minutes to watch. Would love your thoughts!`;
}

/** Inline block shown when stage is "ready" — copy message + open DM + confirm sent */
function SendDMBlock({
  lead,
  onConfirmSent,
}: {
  lead: PipelineLead;
  onConfirmSent: () => Promise<void>;
}) {
  const [message, setMessage] = useState(() => buildDMTemplate(lead));
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const platformUrl =
    lead.platform === "Instagram" && lead.handle
      ? `https://instagram.com/${lead.handle.replace("@", "")}/`
      : lead.platform === "Facebook" && lead.handle
      ? `https://www.facebook.com/${lead.handle.replace("@", "")}/`
      : null;

  async function handleCopy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleConfirm() {
    setSending(true);
    await onConfirmSent();
    setDone(true);
    setSending(false);
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Marked as sent — stage updated to Sent.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-muted p-4">
      {/* Editable message */}
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={7}
        className="text-sm"
      />

      {/* Step 1 + 2 */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy} className="flex-1">
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          {copied ? "Copied!" : "1. Copy message"}
        </Button>

        {platformUrl ? (
          <a href={platformUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              2. Open {lead.platform ?? "DM"} →
            </Button>
          </a>
        ) : (
          <Button variant="outline" size="sm" disabled className="flex-1">
            No platform link
          </Button>
        )}
      </div>

      {/* Step 3 — confirm */}
      <Button
        size="sm"
        className="w-full"
        onClick={handleConfirm}
        disabled={sending}
      >
        <Send className="mr-1.5 h-3.5 w-3.5" />
        {sending ? "Saving…" : "3. ✓ Confirm — I sent the DM"}
      </Button>

      <p className="text-xs text-muted text-center">
        Confirming will move this lead to <strong>Sent</strong> and log it.
      </p>
    </div>
  );
}

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

  const isReady = lead.stage === "ready";

  async function handleMarkDone() {
    await onAddNote(lead.id, "note", `Done: ${action.title}`);
  }

  async function handleConfirmSent() {
    await onUpdateStage(lead.id, "sent");
    await onAddNote(lead.id, "sent", `DM sent to ${lead.name} on ${lead.platform ?? "DM"}`);
  }

  const platformUrl =
    lead.platform === "Instagram" && lead.handle
      ? `https://instagram.com/${lead.handle.replace("@", "")}/`
      : lead.platform === "Facebook" && lead.handle
      ? `https://www.facebook.com/${lead.handle.replace("@", "")}/`
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
          <div className="ml-4 flex shrink-0 items-center gap-1">
            <a
              href={`/leads/${lead.id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open full page"
              className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-text"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Send DM block — only for ready stage */}
          {isReady && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Send DM
              </h3>
              <SendDMBlock lead={enrichedLead} onConfirmSent={handleConfirmSent} />
            </section>
          )}

          {/* Demo tracking */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Demo Tracking
            </h3>
            <DemoTrackingBlock tracking={tracking} isLoading={demoLoading} />
          </section>

          {/* Next action — hidden for ready (replaced by Send DM block above) */}
          {!isReady && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Next Action
              </h3>
              <NextActionBlock action={action} onMarkDone={handleMarkDone} />
            </section>
          )}

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
          {/* For non-ready stages: forward stage + open DM */}
          {!isReady && (
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
          )}
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
