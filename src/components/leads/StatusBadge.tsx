import { Badge } from "@/components/ui/badge";
import type { LeadStatus } from "@/types";

const variants: Record<LeadStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  new: "slate",
  enriching: "cyan",
  enriched: "blue",
  scored: "violet",
  outreach_ready: "emerald",
  dm_sent: "blue",
  replied: "violet",
  demo_shared: "indigo",
  demo_viewed: "cyan",
  demo_completed: "teal",
  follow_up_needed: "amber",
  converted: "emerald",
  lost: "red",
  disqualified: "slate",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <Badge variant={variants[status]}>{status.replaceAll("_", " ")}</Badge>;
}
