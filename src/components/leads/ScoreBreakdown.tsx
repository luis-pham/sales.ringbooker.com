import { Progress } from "@/components/ui/progress";
import type { ScoringFactors } from "@/types";

const labels: Record<keyof ScoringFactors, { label: string; max: number }> = {
  noOnlineBooking: { label: "No online booking", max: 25 },
  activityRecency: { label: "Activity recency", max: 13 },
  ratingScore: { label: "Rating", max: 15 },
  reviewCount: { label: "Review count", max: 12 },
  afterHoursGap: { label: "After-hours gap", max: 12 },
  instagramActive: { label: "Instagram active", max: 10 },
  hasWebsite: { label: "Has website", max: 8 },
  respondsToReviews: { label: "Responds to reviews", max: 5 },
};

export function ScoreBreakdown({ factors }: { factors: ScoringFactors }) {
  return (
    <div className="space-y-3">
      {(Object.entries(factors) as Array<[keyof ScoringFactors, number]>).map(([key, value]) => {
        const config = labels[key];
        if (!config) return null; // skip factors removed from schema (e.g. businessAge)
        return (
          <div key={key} className="space-y-1">
            <div className="flex justify-between gap-3 text-xs">
              <span className="text-muted">{config.label}</span>
              <span className="font-medium text-text">
                {value}/{config.max}
              </span>
            </div>
            <Progress value={(value / config.max) * 100} />
          </div>
        );
      })}
    </div>
  );
}
