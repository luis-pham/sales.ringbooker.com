import { Badge } from "@/components/ui/badge";
import { STAGE_META } from "@/lib/stageConfig";
import type { LeadStage } from "@/types";

export function StageBadge({ stage }: { stage: LeadStage }) {
  const meta = STAGE_META[stage];
  return <Badge variant={meta.badgeVariant}>{meta.label}</Badge>;
}
