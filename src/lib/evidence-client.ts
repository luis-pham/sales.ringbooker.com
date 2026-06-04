import type { LeadStage } from "@/types";

type StepResult = { ok: true } | { ok: false; error: string };

/**
 * Evidence-gated step: logs a timeline event, attaches the screenshot to it, then
 * advances the stage — in that order so a failed upload never advances the lead.
 */
export async function submitStepWithEvidence(opts: {
  leadId: string;
  stage: LeadStage;
  timelineType: "sent" | "replied";
  text: string;
  evidenceType: "dm_screenshot" | "reply_screenshot";
  file: File;
}): Promise<StepResult> {
  const { leadId, stage, timelineType, text, evidenceType, file } = opts;

  // 1. Log the timeline event (returns its id for the evidence FK).
  const tRes = await fetch(`/api/leads/${leadId}/timeline`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: timelineType, text }),
  });
  if (!tRes.ok) return { ok: false, error: "Failed to log step" };
  const { data: event } = (await tRes.json()) as { data: { id: string } };

  // 2. Upload the screenshot attached to that event.
  const fd = new FormData();
  fd.append("file", file);
  fd.append("leadId", leadId);
  fd.append("eventId", event.id);
  fd.append("type", evidenceType);
  const eRes = await fetch("/api/evidence", { method: "POST", body: fd });
  if (!eRes.ok) {
    const j = await eRes.json().catch(() => ({}));
    return { ok: false, error: j.error ?? "Evidence upload failed" };
  }

  // 3. Advance the stage.
  const sRes = await fetch(`/api/leads/${leadId}/stage`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage }),
  });
  if (!sRes.ok) return { ok: false, error: "Stage update failed" };

  return { ok: true };
}
