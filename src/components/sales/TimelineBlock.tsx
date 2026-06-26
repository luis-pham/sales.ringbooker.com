"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TIMELINE_DOT_COLOR } from "@/lib/stageConfig";
import type { TimelineEvent } from "@/types";

export function TimelineBlock({
  events,
  onAddNote,
}: {
  events: TimelineEvent[];
  onAddNote?: (text: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!note.trim() || !onAddNote) return;
    setSaving(true);
    await onAddNote(note.trim());
    setNote("");
    setSaving(false);
  }

  const sorted = [...events].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <p className="text-sm text-muted">Chưa có hoạt động.</p>
      ) : (
        <ol className="space-y-3">
          {sorted.map((event) => {
            const dot = TIMELINE_DOT_COLOR[event.type] ?? "bg-slate-300";
            return (
              <li key={event.id} className="flex gap-3">
                <div className="mt-1.5 flex shrink-0 flex-col items-center">
                  <div className={`h-2 w-2 rounded-full ${dot}`} />
                  <div className="mt-1 h-full w-px bg-border" />
                </div>
                <div className="min-w-0 pb-3">
                  <div className="text-sm text-text">{event.text}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {new Date(event.date).toLocaleString()}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {onAddNote && (
        <div className="space-y-2 border-t border-border pt-4">
          <Textarea
            placeholder="Thêm ghi chú…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <Button size="sm" onClick={handleSave} disabled={!note.trim() || saving}>
            {saving ? "Đang lưu…" : "Lưu ghi chú"}
          </Button>
        </div>
      )}
    </div>
  );
}
