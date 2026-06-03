import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Velocity = {
  sentToViewed: number | null;
  viewedToReplied: number | null;
  repliedToSignedup: number | null;
};

function VelocityRow({
  from,
  to,
  days,
}: {
  from: string;
  to: string;
  days: number | null;
}) {
  const color =
    days === null ? "text-muted" :
    days <= 1 ? "text-emerald-600" :
    days <= 3 ? "text-amber-600" :
    "text-red-600";

  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span>{from}</span>
        <ArrowRight className="h-3 w-3" />
        <span>{to}</span>
      </div>
      <span className={`text-sm font-semibold ${color}`}>
        {days !== null ? `${days}d avg` : "—"}
      </span>
    </div>
  );
}

export function VelocityBlock({ velocity }: { velocity: Velocity }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Avg time between stages</CardTitle>
      </CardHeader>
      <CardContent>
        <VelocityRow from="Sent"    to="Viewed"   days={velocity.sentToViewed} />
        <VelocityRow from="Viewed"  to="Replied"  days={velocity.viewedToReplied} />
        <VelocityRow from="Replied" to="Signed up" days={velocity.repliedToSignedup} />
        <p className="mt-3 text-xs text-muted">Based on last 30 days.</p>
      </CardContent>
    </Card>
  );
}
