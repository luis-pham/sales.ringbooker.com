"use client";

import { useState } from "react";
import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PipelineLead } from "@/types";

function buildTemplate(lead: PipelineLead): string {
  const name = lead.name;
  const demo = lead.demo?.slug ? `https://ringbooker.com/${lead.demo.slug}` : "your personalized demo link";
  return `Hey ${name}! 👋\n\nI noticed you don't have an online booking system yet — I built something that lets salons like yours take bookings 24/7 without lifting a finger.\n\nI put together a quick demo just for you: ${demo}\n\nTakes 2 minutes to watch. Would love your thoughts!`;
}

function buildGenericTemplate(leads: PipelineLead[]): string {
  return `Hey! 👋\n\nI help salons take bookings 24/7 with an AI-powered system — no tech skills needed.\n\nI'm reaching out to ${leads.length} businesses like yours to share a quick demo. Would you be open to taking a look?\n\nTakes 2 minutes. Let me know!`;
}

export function DMTemplateModal({
  leads,
  onClose,
}: {
  leads: PipelineLead[];
  onClose: () => void;
}) {
  const isSingle = leads.length === 1;
  const [copied, setCopied] = useState(false);
  const text = isSingle ? buildTemplate(leads[0]) : buildGenericTemplate(leads);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-modal)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">
            {isSingle ? `DM template — ${leads[0].name}` : `Generic template (${leads.length} leads)`}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <Textarea value={text} readOnly rows={9} className="font-mono text-sm" />

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={handleCopy}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
