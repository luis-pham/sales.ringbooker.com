import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STAGE_META } from "@/lib/stageConfig";
import type { LeadStage } from "@/types";

export function FunnelChart({
  funnel,
}: {
  funnel: Array<{ stage: LeadStage; count: number }>;
}) {
  const max = Math.max(...funnel.map((f) => f.count), 1);
  const total = funnel.reduce((s, f) => s + f.count, 0);

  // Only show stages that have leads OR are in the active funnel (not ghosted/churned)
  const active = funnel.filter(
    (f) => !["ghosted", "churned"].includes(f.stage) || f.count > 0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Pipeline funnel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {active.map(({ stage, count }) => {
          const meta = STAGE_META[stage];
          const pct = Math.round((count / max) * 100);
          const sharePct = total > 0 ? Math.round((count / total) * 100) : 0;
          const barColor =
            stage === "hot" ? "bg-amber-500" :
            stage === "converted" ? "bg-emerald-600" :
            stage === "ghosted" || stage === "churned" ? "bg-red-400" :
            "bg-violet-500";

          return (
            <div key={stage} className="flex items-center gap-3">
              <div className="w-20 shrink-0 text-right text-xs text-muted">{meta.label}</div>
              <div className="flex flex-1 items-center gap-2">
                <div className="h-6 flex-1 overflow-hidden rounded bg-surface-muted">
                  <div
                    className={`h-full rounded transition-all ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="w-16 shrink-0 text-right text-xs">
                  <span className="font-medium text-text">{count}</span>
                  <span className="ml-1 text-muted">({sharePct}%)</span>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
