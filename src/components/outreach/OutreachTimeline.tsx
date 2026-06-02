import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OutreachEvent } from "@/types";

export function OutreachTimeline({ events }: { events: OutreachEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted">No outreach logged yet.</p>
        ) : (
          <ol className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="border-l-2 border-border pl-3">
                <div className="text-sm font-medium text-text">{event.type.replaceAll("_", " ")}</div>
                {event.notes ? <div className="mt-1 text-sm text-muted">{event.notes}</div> : null}
                <div className="mt-1 text-xs text-muted">{new Date(event.created_at).toLocaleString()}</div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
