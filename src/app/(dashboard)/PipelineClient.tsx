import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/leads/StatusBadge";
import type { LeadStatus } from "@/types";

type PipelineLead = {
  id: string;
  name: string;
  status: LeadStatus;
  city: string | null;
  state: string | null;
};

const columns: Array<{ status: LeadStatus; title: string }> = [
  { status: "outreach_ready", title: "Ready" },
  { status: "dm_sent", title: "DM sent" },
  { status: "replied", title: "Replied" },
  { status: "demo_shared", title: "Demo shared" },
  { status: "converted", title: "Converted" },
];

export function PipelineClient({ leads }: { leads: PipelineLead[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {columns.map((column) => {
        const rows = leads.filter((lead) => lead.status === column.status);
        return (
          <Card key={column.status}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm">
                {column.title}
                <span className="text-xs text-muted">{rows.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.slice(0, 10).map((lead) => (
                <Link key={lead.id} href={`/leads/${lead.id}`} prefetch={false} className="block rounded-md border border-border p-3 hover:bg-slate-50">
                  <div className="text-sm font-medium text-text">{lead.name}</div>
                  <div className="mt-1 text-xs text-muted">{[lead.city, lead.state].filter(Boolean).join(", ")}</div>
                  <div className="mt-2">
                    <StatusBadge status={lead.status} />
                  </div>
                </Link>
              ))}
              {rows.length === 0 ? <div className="text-sm text-muted">No leads.</div> : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
