"use client";

import Link from "next/link";
import { ScoreBadge } from "@/components/leads/ScoreBadge";
import { StatusBadge } from "@/components/leads/StatusBadge";
import { TierBadge } from "@/components/leads/TierBadge";

type LeadRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  website_url: string | null;
  rating: number | null;
  review_count: number | null;
  status: any;
  lead_scores?: Array<{ score: number; priority: 1 | 2 | 3; tier: "A" | "B" | "C" | null; tier_platform: string | null }>;
};

export function LeadListClient({ leads }: { leads: LeadRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th className="px-4 py-3">Salon</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">Tier</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Rating</th>
            <th className="px-4 py-3">Contact</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const score = lead.lead_scores?.[0];
            return (
              <tr key={lead.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/leads/${lead.id}`} className="font-medium text-violet-700">
                    {lead.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {[lead.city, lead.state].filter(Boolean).join(", ") || "Unknown location"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ScoreBadge score={score?.score} priority={score?.priority} />
                </td>
                <td className="px-4 py-3">
                  <TierBadge tier={score?.tier} platform={score?.tier_platform} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="px-4 py-3">
                  {lead.rating ?? "-"} · {lead.review_count ?? 0} reviews
                </td>
                <td className="px-4 py-3 text-muted">{lead.phone ?? lead.website_url ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
