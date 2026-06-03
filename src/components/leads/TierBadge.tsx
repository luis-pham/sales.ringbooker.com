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

// Integration approach (not a quality grade) — how RingBooker's AI fits their booking setup
const tierLabels: Record<string, string> = {
  A: "Direct",   // enterprise platform (Square/Vagaro...) — AI books straight into their calendar
  B: "Link",     // consumer booking app (Booksy/Fresha...) — AI texts the booking link
  C: "Capture",  // no platform detected — AI captures caller info
};

export function TierBadge({ tier, platform }: { tier?: "A" | "B" | "C" | null; platform?: string | null }) {
  if (!tier) return <span className="text-xs text-muted">—</span>;
  return (
    <Badge variant={tier === "A" ? "violet" : tier === "B" ? "blue" : "slate"}>
      {tierLabels[tier] ?? tier}
      {platform ? ` · ${labels[platform] ?? platform}` : ""}
    </Badge>
  );
}
