import { Progress } from "@/components/ui/progress";
import type { DemoTracking, DemoSession } from "@/types";

function timeBadge(hour: number) {
  if (hour < 12) return { label: "Buổi sáng", cls: "bg-amber-50 text-amber-700" };
  if (hour < 17) return { label: "Buổi chiều", cls: "bg-blue-50 text-blue-700" };
  return { label: "Buổi tối", cls: "bg-violet-50 text-violet-700" };
}

function pctColor(pct: number) {
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  return "text-muted";
}

function SessionRow({ session }: { session: DemoSession }) {
  const badge = timeBadge(session.hour);
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="text-xs text-muted shrink-0">
          {session.date} · {session.time}
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-xs">
        <span className="text-muted">{session.duration}</span>
        <span className={`font-medium ${pctColor(session.pct)}`}>{session.pct}%</span>
      </div>
    </div>
  );
}

export function DemoTrackingBlock({
  tracking,
  isLoading,
}: {
  tracking: DemoTracking | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-24 rounded bg-surface-muted animate-pulse" />
        <div className="h-4 w-full rounded bg-surface-muted animate-pulse" />
      </div>
    );
  }

  if (!tracking) {
    return <p className="text-sm text-muted">Chưa chia sẻ demo.</p>;
  }

  const isHot = tracking.plays >= 2 || tracking.pct >= 80;
  const barColor = isHot ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-4">
      {tracking.slug && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">URL:</span>
          <a
            href={`https://ringbooker.com/${tracking.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-violet-700 hover:underline truncate"
          >
            ringbooker.com/{tracking.slug}
          </a>
        </div>
      )}

      {tracking.lastSeen && (
        <div className="text-xs text-muted">
          Xem lần cuối: {new Date(tracking.lastSeen).toLocaleString()}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Lượt xem", String(tracking.plays)],
          ["Đã nghe", `${tracking.pct}%`],
          ["Xem lần cuối", tracking.lastSeen ? new Date(tracking.lastSeen).toLocaleDateString() : "—"],
          ["Phiên", String(tracking.sessions.length)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border p-2">
            <div className="text-xs text-muted">{label}</div>
            <div className="mt-0.5 text-sm font-semibold text-text">{value}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted">
          <span>Đã nghe</span>
          <span>{tracking.pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${tracking.pct}%` }}
          />
        </div>
      </div>

      {/* Sessions */}
      {tracking.sessions.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted uppercase tracking-wide">Phiên</div>
          <div>
            {tracking.sessions.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
