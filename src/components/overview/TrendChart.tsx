import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TrendDay = {
  date: string;
  label: string;
  dmsSent: number;
  views: number;
  conversions: number;
};

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const h = max > 0 ? Math.max(4, Math.round((value / max) * 64)) : 4;
  return (
    <div className="flex flex-col items-center justify-end" style={{ height: 64 }}>
      <div
        className={`w-4 rounded-t ${color}`}
        style={{ height: h }}
        title={String(value)}
      />
    </div>
  );
}

export function TrendChart({ trend }: { trend: TrendDay[] }) {
  const maxDms = Math.max(...trend.map((d) => d.dmsSent), 1);
  const maxViews = Math.max(...trend.map((d) => d.views), 1);

  const legend = [
    { label: "DMs sent", color: "bg-blue-500" },
    { label: "Demo views", color: "bg-violet-500" },
    { label: "Conversions", color: "bg-emerald-500" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Last 7 days</CardTitle>
          <div className="flex items-center gap-3">
            {legend.map((l) => (
              <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted">
                <div className={`h-2 w-2 rounded-full ${l.color}`} />
                {l.label}
              </div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3">
          {trend.map((day) => (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex items-end gap-0.5">
                <Bar value={day.dmsSent}     max={maxDms}   color="bg-blue-500" />
                <Bar value={day.views}       max={maxViews} color="bg-violet-500" />
                <Bar value={day.conversions} max={3}        color="bg-emerald-500" />
              </div>
              <span className="text-xs text-muted">{day.label}</span>
            </div>
          ))}
        </div>

        {/* Numeric summary row */}
        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3">
          {[
            ["DMs sent", trend.reduce((s, d) => s + d.dmsSent, 0), "text-blue-600"],
            ["Views", trend.reduce((s, d) => s + d.views, 0), "text-violet-700"],
            ["Conversions", trend.reduce((s, d) => s + d.conversions, 0), "text-emerald-600"],
          ].map(([label, total, cls]) => (
            <div key={label as string} className="text-center">
              <div className={`text-lg font-semibold ${cls}`}>{total}</div>
              <div className="text-xs text-muted">{label}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
