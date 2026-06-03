import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Member = {
  id: string;
  name: string;
  email: string;
  assigned: number;
  active: number;
  dmsSentThisWeek: number;
  viewsThisWeek: number;
  converted: number;
  ghostedPct: number;
};

function PerfDot({ value, thresholds }: { value: number; thresholds: [number, number] }) {
  const color =
    value >= thresholds[1] ? "bg-emerald-500" :
    value >= thresholds[0] ? "bg-amber-500" :
    "bg-red-500";
  return <div className={`h-2 w-2 rounded-full shrink-0 ${color}`} />;
}

export function TeamTable({ members }: { members: Member[] }) {
  if (members.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted">No team members yet.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Per-person breakdown (this week)</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3 text-right">Assigned</th>
                <th className="px-4 py-3 text-right">Active</th>
                <th className="px-4 py-3 text-right">DMs sent</th>
                <th className="px-4 py-3 text-right">Views</th>
                <th className="px-4 py-3 text-right">Converted</th>
                <th className="px-4 py-3 text-right">Ghosted %</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text">{m.name}</div>
                    <div className="text-xs text-muted">{m.email}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-muted">{m.assigned}</td>
                  <td className="px-4 py-3 text-right text-muted">{m.active}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <PerfDot value={m.dmsSentThisWeek} thresholds={[3, 7]} />
                      <span className={m.dmsSentThisWeek === 0 ? "text-red-600 font-medium" : "text-text"}>
                        {m.dmsSentThisWeek}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <PerfDot value={m.viewsThisWeek} thresholds={[1, 3]} />
                      <span className="text-text">{m.viewsThisWeek}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={m.converted > 0 ? "font-semibold text-emerald-600" : "text-muted"}>
                      {m.converted}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={
                      m.ghostedPct > 30 ? "font-medium text-red-600" :
                      m.ghostedPct > 15 ? "text-amber-600" :
                      "text-muted"
                    }>
                      {m.ghostedPct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border">
          {[
            ["bg-emerald-500", "Good"],
            ["bg-amber-500", "Needs attention"],
            ["bg-red-500", "Underperforming"],
          ].map(([color, label]) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-muted">
              <div className={`h-2 w-2 rounded-full ${color}`} />
              {label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
