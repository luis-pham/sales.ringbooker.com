"use client";

import { useState } from "react";
import { Copy, ExternalLink, Ghost, MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StageBadge } from "./StageBadge";
import { DemoTrackingBlock } from "./DemoTrackingBlock";
import { NextActionBlock } from "./NextActionBlock";
import { TimelineBlock } from "./TimelineBlock";
import { EvidencePicker } from "./EvidencePicker";
import { EvidenceList } from "./EvidenceList";
import { useDemoTracking } from "@/hooks/useDemoTracking";
import { getNextAction } from "@/lib/getNextAction";
import { submitStepWithEvidence } from "@/lib/evidence-client";
import { buildOpener } from "@/lib/outreach/dm-templates";
import { STAGE_META, nextFunnelStage } from "@/lib/stageConfig";
import type { PipelineLead, LeadStage, TimelineEvent } from "@/types";

const HIDE_GHOSTED_FOR: LeadStage[] = ["converted", "ghosted", "churned"];
// Stages from which a reply can be logged (you must have sent first).
const CAN_REPLY_FROM: LeadStage[] = ["sent", "viewed", "hot"];

function platformLink(lead: PipelineLead): string | null {
  if (lead.platform === "Instagram" && lead.handle) return `https://instagram.com/${lead.handle.replace("@", "")}/`;
  if (lead.platform === "Facebook" && lead.handle) return `https://www.facebook.com/${lead.handle.replace("@", "")}/`;
  return null;
}

// First DM is the curiosity opener (no link) — see dm-templates. The demo link
// goes out in the reveal after they reply.
function buildDMTemplate(lead: PipelineLead): string {
  return buildOpener(lead);
}

/** ready stage: copy message + open DM + REQUIRED screenshot + confirm sent. */
function SendDMBlock({ lead, onDone }: { lead: PipelineLead; onDone: () => void }) {
  const [message, setMessage] = useState(() => buildDMTemplate(lead));
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [qaChecked, setQaChecked] = useState(false);
  const [qaSaving, setQaSaving] = useState(false);
  const platformUrl = platformLink(lead);
  const demoUrl = lead.demo?.slug ? `https://ringbooker.com/${lead.demo.slug}` : null;

  async function handleCopy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleQaToggle(checked: boolean) {
    if (!checked) { setQaChecked(false); return; }
    setQaSaving(true);
    const res = await fetch(`/api/leads/${lead.id}/demo`, { method: "PATCH" });
    setQaSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Could not record demo check");
      return;
    }
    setQaChecked(true);
  }

  async function handleConfirm() {
    if (!file || !qaChecked) return;
    setSending(true);
    const res = await submitStepWithEvidence({
      leadId: lead.id,
      stage: "sent",
      timelineType: "sent",
      text: `DM sent to ${lead.name} on ${lead.platform ?? "DM"}`,
      evidenceType: "dm_screenshot",
      file,
    });
    setSending(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("DM logged with proof");
    onDone();
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-muted p-4">
      {/* QA gate — verify demo quality before sending */}
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
        <div className="mb-1.5 text-xs font-medium text-amber-800 dark:text-amber-400">
          Demo quality check (required) - you will send this link in the reveal after they reply
        </div>
        {demoUrl ? (
          <a href={demoUrl} target="_blank" rel="noopener noreferrer"
             className="block truncate text-xs text-violet-700 hover:underline dark:text-violet-400">
            Open demo: {demoUrl}
          </a>
        ) : (
          <p className="text-xs text-muted">No demo for this lead yet.</p>
        )}
        <label className="mt-2 flex items-center gap-2 text-xs text-text">
          <input
            type="checkbox"
            checked={qaChecked}
            disabled={qaSaving || !demoUrl}
            onChange={(e) => handleQaToggle(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          {qaSaving ? "Saving..." : "I reviewed the demo and it meets quality standards"}
        </label>
      </div>

      <div className="text-xs font-medium text-muted">Opener — curiosity, no link (share the demo after they reply)</div>
      <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className="text-sm" />

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
          <Button variant="outline" size="sm" disabled className="flex-1">No platform link</Button>
        )}
      </div>

      {/* Step 3 — required screenshot */}
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted">3. Screenshot of the DM (required)</div>
        <EvidencePicker file={file} onChange={setFile} label="Upload DM screenshot" />
      </div>

      <Button size="sm" className="w-full" onClick={handleConfirm} disabled={sending || !file || !qaChecked}>
        <Send className="mr-1.5 h-3.5 w-3.5" />
        {sending ? "Saving…" : "4. ✓ Confirm — I sent the DM"}
      </Button>
      <p className="text-center text-xs text-muted">
        Sends the opener (no link). Requires demo check + screenshot. Moves the lead to <strong>Sent</strong>; share the demo in the reveal after they reply.
      </p>
    </div>
  );
}

/** Reply step: REQUIRED screenshot + optional note → moves to Replied. */
function ReplyEvidenceForm({ lead, onDone, onCancel }: { lead: PipelineLead; onDone: () => void; onCancel: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!file) return;
    setSaving(true);
    const res = await submitStepWithEvidence({
      leadId: lead.id,
      stage: "replied",
      timelineType: "replied",
      text: note.trim() || `${lead.name} replied`,
      evidenceType: "reply_screenshot",
      file,
    });
    setSaving(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Reply logged with proof");
    onDone();
  }

  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-950/20">
      <div className="text-xs font-medium text-violet-700 dark:text-violet-400">Log reply — screenshot required</div>
      <EvidencePicker file={file} onChange={setFile} label="Upload reply screenshot" />
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note (optional)" className="text-sm" />
      <div className="flex items-center gap-2">
        <Button size="sm" className="flex-1" onClick={handleSubmit} disabled={saving || !file}>
          {saving ? "Saving…" : "Confirm reply"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export function LeadPanel({
  lead,
  onClose,
  onUpdateStage,
  onAddNote,
  onChanged,
}: {
  lead: PipelineLead;
  onClose: () => void;
  onUpdateStage: (id: string, stage: LeadStage) => Promise<void>;
  onAddNote: (id: string, type: TimelineEvent["type"], text: string) => Promise<void>;
  onChanged?: (stage: LeadStage) => void;
}) {
  const { tracking, isLoading: demoLoading } = useDemoTracking(lead.id);
  const enrichedLead = tracking ? { ...lead, demo: tracking } : lead;
  const action = getNextAction(enrichedLead);
  const fwdStage = nextFunnelStage(lead.stage);

  const [replyMode, setReplyMode] = useState(false);
  const [evidenceReload, setEvidenceReload] = useState(0);

  const isReady = lead.stage === "ready";
  const canReply = CAN_REPLY_FROM.includes(lead.stage);

  async function handleMarkDone() {
    await onAddNote(lead.id, "note", `Done: ${action.title}`);
  }

  function handleStepDone(stage: LeadStage) {
    setEvidenceReload((n) => n + 1);
    setReplyMode(false);
    onChanged?.(stage);
  }

  // Generic forward button: if the target is "replied", route through the evidence gate.
  function handleNext() {
    if (!fwdStage) return;
    if (fwdStage === "replied") { setReplyMode(true); return; }
    onUpdateStage(lead.id, fwdStage);
  }

  const platformUrl = platformLink(lead);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 dark:bg-black/50" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-[var(--shadow-modal)]">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-text">{lead.name}</h2>
              <StageBadge stage={lead.stage} />
            </div>
            <div className="mt-0.5 text-sm text-muted">
              {lead.location}{lead.businessType ? ` · ${lead.businessType}` : ""}
            </div>
            {lead.handle && (
              <div className="mt-0.5 text-xs text-muted">
                {lead.platform} · {lead.handle}{lead.followers ? ` · ${lead.followers} followers` : ""}
              </div>
            )}
          </div>
          <div className="ml-4 flex shrink-0 items-center gap-1">
            <a href={`/leads/${lead.id}`} target="_blank" rel="noopener noreferrer" title="Open full page"
              className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-text">
              <ExternalLink className="h-4 w-4" />
            </a>
            <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-text">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isReady && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Send DM</h3>
              <SendDMBlock lead={enrichedLead} onDone={() => handleStepDone("sent")} />
            </section>
          )}

          {replyMode && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Log reply</h3>
              <ReplyEvidenceForm lead={lead} onDone={() => handleStepDone("replied")} onCancel={() => setReplyMode(false)} />
            </section>
          )}

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Demo Tracking</h3>
            <DemoTrackingBlock tracking={tracking} isLoading={demoLoading} />
          </section>

          {!isReady && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Next Action</h3>
              <NextActionBlock action={action} onMarkDone={handleMarkDone} />
            </section>
          )}

          {/* Evidence */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Evidence</h3>
            <EvidenceList leadId={lead.id} reloadKey={evidenceReload} />
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Timeline</h3>
            <TimelineBlock events={lead.timeline} onAddNote={(text) => onAddNote(lead.id, "note", text)} />
          </section>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-4 space-y-2">
          {!isReady && (
            <div className="flex flex-wrap items-center gap-2">
              {fwdStage && (
                <Button size="sm" className="flex-1" onClick={handleNext}>
                  → {STAGE_META[fwdStage].label}
                </Button>
              )}
              {canReply && !replyMode && (
                <Button variant="outline" size="sm" onClick={() => setReplyMode(true)}>
                  <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                  Log reply
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
            <Button variant="ghost" size="sm" className="w-full text-muted" onClick={() => onUpdateStage(lead.id, "ghosted")}>
              <Ghost className="mr-1.5 h-3.5 w-3.5" />
              Mark as ghosted
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
