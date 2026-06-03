import { Badge } from "@/components/ui/badge";

const labels: Record<string, string> = {
  square: "Square",
  vagaro: "Vagaro",
  mindbody: "Mindbody",
  acuity: "Acuity",
  glossgenius: "GlossGenius",
  booksy: "Booksy",
  fresha: "Fresha",
  boulevard: "Boulevard",
  styleseat: "StyleSeat",
  schedulicity: "Schedulicity",
};

export function TierBadge({ tier, platform }: { tier?: "A" | "B" | "C" | null; platform?: string | null }) {
  if (!tier) return <span className="text-xs text-muted">—</span>;
  return (
    <Badge variant={tier === "A" ? "violet" : tier === "B" ? "blue" : "slate"}>
      Tier {tier}
      {platform ? ` · ${labels[platform] ?? platform}` : ""}
    </Badge>
  );
}
