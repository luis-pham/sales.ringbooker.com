import {
  Activity, BookOpen, CheckCircle, Clock, Flame, Ghost,
  MessageCircle, RefreshCw, RotateCcw, Send, Settings, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { URGENCY_COLOR } from "@/lib/stageConfig";
import type { NextAction } from "@/types";

const ICON_MAP: Record<string, React.ElementType> = {
  Activity, BookOpen, CheckCircle, Clock, Flame, Ghost,
  MessageCircle, RefreshCw, RotateCcw, Send, Settings, Zap,
};

export function NextActionBlock({
  action,
  onMarkDone,
}: {
  action: NextAction;
  onMarkDone?: () => void;
}) {
  const Icon = ICON_MAP[action.icon] ?? Zap;
  const borderCls = URGENCY_COLOR[action.urgency];

  return (
    <div className={`rounded-lg border-2 p-4 ${borderCls}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{action.title}</div>
          <div className="mt-0.5 text-xs opacity-80">{action.desc}</div>
          <div className="mt-1 text-xs font-medium">Due: {action.due}</div>
        </div>
      </div>
      {onMarkDone && (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={onMarkDone}>
            Mark done + log
          </Button>
        </div>
      )}
    </div>
  );
}
