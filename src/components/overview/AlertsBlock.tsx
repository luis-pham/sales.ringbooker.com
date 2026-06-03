import { AlertTriangle, Clock, Flame } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Alerts = {
  stuckLeads: number;
  hotUncontacted: number;
  trialOverdue: number;
};

export function AlertsBlock({ alerts }: { alerts: Alerts }) {
  const items = [
    {
      icon: Flame,
      label: "Hot leads — no follow-up in 24h",
      count: alerts.hotUncontacted,
      color: "text-red-600",
      bg: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900",
    },
    {
      icon: Clock,
      label: "Trial leads — overdue day-3 check-in",
      count: alerts.trialOverdue,
      color: "text-amber-600",
      bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900",
    },
    {
      icon: AlertTriangle,
      label: "Leads stuck > 7 days same stage",
      count: alerts.stuckLeads,
      color: "text-muted",
      bg: "bg-surface-muted border-border",
    },
  ];

  const hasAlerts = items.some((i) => i.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!hasAlerts && (
          <p className="text-sm text-emerald-600">All clear — no urgent items.</p>
        )}
        {items.map(({ icon: Icon, label, count, color, bg }) =>
          count > 0 ? (
            <div
              key={label}
              className={`flex items-center gap-3 rounded-md border px-3 py-2 ${bg}`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${color}`} />
              <span className={`flex-1 text-sm ${color}`}>{label}</span>
              <span className={`text-sm font-semibold ${color}`}>{count}</span>
            </div>
          ) : null,
        )}
      </CardContent>
    </Card>
  );
}
