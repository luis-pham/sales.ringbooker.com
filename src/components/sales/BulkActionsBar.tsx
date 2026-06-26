"use client";

import { Ghost, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BulkActionsBar({
  count,
  onCopyDM,
  onMarkGhosted,
  onClear,
}: {
  count: number;
  onCopyDM: () => void;
  onMarkGhosted: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 dark:border-violet-800 dark:bg-violet-950/30">
      <span className="text-sm font-medium text-violet-700 dark:text-violet-400">
        Đã chọn {count}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onCopyDM}>
          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
          Sao chép mẫu DM
        </Button>
        <Button variant="outline" size="sm" onClick={onMarkGhosted}>
          <Ghost className="mr-1.5 h-3.5 w-3.5" />
          Đánh dấu mất liên lạc
        </Button>
        <button
          onClick={onClear}
          className="ml-1 rounded p-1 text-muted hover:bg-violet-100 hover:text-violet-700 dark:hover:bg-violet-900/30"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
