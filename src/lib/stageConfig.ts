import type { LeadStage, TimelineEventType } from "@/types";

export type StageMeta = {
  label: string;
  badgeVariant: "slate" | "violet" | "blue" | "cyan" | "emerald" | "amber" | "red" | "indigo" | "teal";
  dotColor: string;   // tailwind bg-* class for timeline dots
  order: number;      // sort order for pipeline columns
};

export const STAGE_META: Record<LeadStage, StageMeta> = {
  ready:      { label: "Ready",      badgeVariant: "slate",   dotColor: "bg-slate-400",   order: 0 },
  sent:       { label: "Sent",       badgeVariant: "blue",    dotColor: "bg-blue-500",    order: 1 },
  viewed:     { label: "Viewed",     badgeVariant: "cyan",    dotColor: "bg-cyan-500",    order: 2 },
  hot:        { label: "Hot",        badgeVariant: "amber",   dotColor: "bg-amber-500",   order: 3 },
  replied:    { label: "Replied",    badgeVariant: "violet",  dotColor: "bg-violet-500",  order: 4 },
  signedup:   { label: "Signed up",  badgeVariant: "indigo",  dotColor: "bg-indigo-500",  order: 5 },
  onboarding: { label: "Onboarding", badgeVariant: "teal",    dotColor: "bg-teal-500",    order: 6 },
  trial:      { label: "Trial",      badgeVariant: "emerald", dotColor: "bg-emerald-400", order: 7 },
  converted:  { label: "Converted",  badgeVariant: "emerald", dotColor: "bg-emerald-600", order: 8 },
  ghosted:    { label: "Ghosted",    badgeVariant: "red",     dotColor: "bg-red-400",     order: 9 },
  churned:    { label: "Churned",    badgeVariant: "red",     dotColor: "bg-red-600",     order: 10 },
};

export const STAGE_ORDER: LeadStage[] = [
  "ready", "sent", "viewed", "hot", "replied",
  "signedup", "onboarding", "trial", "converted", "ghosted", "churned",
];

export const TIMELINE_DOT_COLOR: Record<TimelineEventType, string> = {
  ready:      "bg-slate-400",
  sent:       "bg-blue-500",
  viewed:     "bg-cyan-500",
  hot:        "bg-amber-500",
  replied:    "bg-violet-500",
  signedup:   "bg-indigo-500",
  onboarding: "bg-teal-500",
  trial:      "bg-emerald-400",
  converted:  "bg-emerald-600",
  ghosted:    "bg-red-400",
  churned:    "bg-red-600",
  note:       "bg-slate-300",
};

/** Stage that comes after the current one in the forward funnel */
export function nextFunnelStage(stage: LeadStage): LeadStage | null {
  const forwardOrder: LeadStage[] = [
    "ready", "sent", "viewed", "hot", "replied",
    "signedup", "onboarding", "trial", "converted",
  ];
  const idx = forwardOrder.indexOf(stage);
  return idx >= 0 && idx < forwardOrder.length - 1 ? forwardOrder[idx + 1] : null;
}

/** Urgency → border/text color class */
export const URGENCY_COLOR = {
  urgent: "border-red-500 text-red-600",
  soon:   "border-amber-500 text-amber-600",
  ok:     "border-emerald-500 text-emerald-600",
} as const;

export const URGENCY_DOT = {
  urgent: "bg-red-500",
  soon:   "bg-amber-500",
  ok:     "bg-emerald-500",
} as const;
