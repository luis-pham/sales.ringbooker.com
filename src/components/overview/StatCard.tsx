import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "red" | "amber" | "emerald" | "violet";
}) {
  const valueColor =
    accent === "red" ? "text-red-600" :
    accent === "amber" ? "text-amber-600" :
    accent === "emerald" ? "text-emerald-600" :
    accent === "violet" ? "text-violet-700" :
    "text-text";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
      </CardContent>
    </Card>
  );
}
