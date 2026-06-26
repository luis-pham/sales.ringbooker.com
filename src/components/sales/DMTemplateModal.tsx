"use client";

import { useState } from "react";
import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { buildDmSequence, buildOpener } from "@/lib/outreach/dm-templates";
import type { PipelineLead } from "@/types";

/** One labelled, copyable message block. */
function CopyBlock({ label, hint, text, rows = 4 }: { label: string; hint?: string; text: string; rows?: number }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-text">{label}</span>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="h-6 px-2">
          <Copy className="mr-1 h-3 w-3" />
          {copied ? "Đã sao chép!" : "Sao chép"}
        </Button>
      </div>
      {hint && <p className="mb-1.5 text-xs text-muted">{hint}</p>}
      <Textarea value={text} readOnly rows={rows} className="text-sm" />
    </div>
  );
}

/** Single lead: full randomized 2-step sequence + contextual follow-ups. */
function SingleSequence({ lead }: { lead: PipelineLead }) {
  const seq = buildDmSequence(lead);
  return (
    <div className="space-y-4">
      <CopyBlock
        label="1 · Tin mở đầu (gửi trước — không kèm link)"
        hint="DM lạnh. Gợi tò mò + xin phép. Chờ họ phản hồi trước khi gửi demo."
        text={seq.opener}
        rows={3}
      />
      <CopyBlock
        label="2 · Tiết lộ + link demo (sau khi họ phản hồi)"
        hint="Gửi sau khi họ phản hồi. Tiếp nối sự tò mò bằng demo cá nhân hóa."
        text={seq.reveal}
        rows={5}
      />
      <div className="rounded-lg border border-border bg-surface-muted p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Follow-up (chọn theo tình huống)</div>
        <div className="space-y-3">
          <CopyBlock label="Đã mở, chưa phản hồi" text={seq.followUps.openedNoReply} rows={2} />
          <CopyBlock label="Đã phản hồi, chưa mở link" text={seq.followUps.notOpened} rows={3} />
          <CopyBlock label="Phản ứng tích cực" text={seq.followUps.positive} rows={2} />
        </div>
      </div>
    </div>
  );
}

/** Multiple leads: first-touch openers (each personalized) for bulk outreach. */
function BulkOpeners({ leads }: { leads: PipelineLead[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Mỗi lead có một tin mở đầu ngẫu nhiên riêng (không kèm link). Chờ phản hồi trước, sau đó mở lead để lấy tin tiết lộ + link demo.
      </p>
      <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
        {leads.map((lead) => (
          <CopyBlock key={lead.id} label={lead.name} text={buildOpener(lead)} rows={2} />
        ))}
      </div>
    </div>
  );
}

export function DMTemplateModal({
  leads,
  onClose,
}: {
  leads: PipelineLead[];
  onClose: () => void;
}) {
  const isSingle = leads.length === 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-modal)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">
            {isSingle ? `Chuỗi DM — ${leads[0].name}` : `Tin mở đầu (${leads.length} Lead)`}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isSingle ? <SingleSequence lead={leads[0]} /> : <BulkOpeners leads={leads} />}

        <div className="mt-5 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </div>
  );
}
