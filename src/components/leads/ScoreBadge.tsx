import { Badge } from "@/components/ui/badge";

export function ScoreBadge({
  score,
  priority,
}: {
  score: number | null | undefined;
  priority?: 1 | 2 | 3 | null;
}) {
  if (score == null) return <span className="text-xs text-muted">—</span>;
  const p = priority ?? (score >= 70 ? 1 : score >= 50 ? 2 : 3);
  return (
    <Badge variant={p === 1 ? "emerald" : p === 2 ? "amber" : "slate"}>
      {score} · {p === 1 ? "High" : p === 2 ? "Med" : "Low"}
    </Badge>
  );
}
