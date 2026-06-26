"use client";

import { useEffect, useState } from "react";

type Evidence = {
  id: string;
  type: string;
  fileName: string | null;
  notes: string | null;
  createdAt: string;
  url: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  dm_screenshot: "DM",
  reply_screenshot: "Phản hồi",
  demo_shared_screenshot: "Đã chia sẻ demo",
  demo_viewed_confirm: "Đã xem demo",
  converted_proof: "Đã chuyển đổi",
  other: "Khác",
};

/** Evidence thumbnails for a lead. `reloadKey` bumps to refetch after a new upload. */
export function EvidenceList({ leadId, reloadKey = 0 }: { leadId: string; reloadKey?: number }) {
  const [items, setItems] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leads/${leadId}/evidence`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => !cancelled && setItems(j.data ?? []))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [leadId, reloadKey]);

  if (loading) return <div className="text-xs text-muted">Đang tải…</div>;
  if (items.length === 0) return <p className="text-sm text-muted">Chưa có bằng chứng.</p>;

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((e) => (
        <a
          key={e.id}
          href={e.url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block overflow-hidden rounded-md border border-border"
          title={`${TYPE_LABEL[e.type] ?? e.type} · ${new Date(e.createdAt).toLocaleString()}`}
        >
          {e.url ? (
            <img src={e.url} alt={e.type} className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square items-center justify-center bg-surface-muted text-xs text-muted">không có</div>
          )}
          <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[10px] text-white">
            {TYPE_LABEL[e.type] ?? e.type}
          </span>
        </a>
      ))}
    </div>
  );
}
