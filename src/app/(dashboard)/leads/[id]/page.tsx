import Link from "next/link";
import { DemoCard } from "@/components/demo/DemoCard";
import { ScoreBadge } from "@/components/leads/ScoreBadge";
import { ScoreBreakdown } from "@/components/leads/ScoreBreakdown";
import { StatusBadge } from "@/components/leads/StatusBadge";
import { TierBadge } from "@/components/leads/TierBadge";
import { LogEventForm } from "@/components/outreach/LogEventForm";
import { OutreachTimeline } from "@/components/outreach/OutreachTimeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InstagramSnapshot, LeadScore, OutreachEvent, RingbookerDemo, SalonLead, WebsiteSnapshot } from "@/types";
import { LeadActions } from "./LeadActions";

type LeadDetail = SalonLead & {
  lead_scores?: LeadScore[];
  website_snapshots?: WebsiteSnapshot[];
  instagram_snapshots?: InstagramSnapshot[];
  ringbooker_demos?: RingbookerDemo[];
  outreach_events?: OutreachEvent[];
};

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth();
  const { id } = await params;
  const { data: lead, error } = await createAdminClient()
    .from("salon_leads")
    .select("*, lead_scores(*), website_snapshots(*), instagram_snapshots(*), ringbooker_demos(*), outreach_events(*)")
    .eq("id", id)
    .maybeSingle<LeadDetail>();

  if (error) {
    console.error("[lead-detail] Supabase error:", error.message, "id:", id);
    return (
      <div className="space-y-2 p-4">
        <div className="text-sm font-medium text-red-600">Failed to load lead</div>
        <div className="font-mono text-xs text-muted">{error.message}</div>
      </div>
    );
  }

  if (!lead) {
    return <div className="text-sm text-muted">Lead not found (id: {id}).</div>;
  }

  if (profile.role !== "admin" && lead.assigned_to !== profile.id) {
    return <div className="text-sm text-muted">You do not have access to this lead.</div>;
  }

  const score = lead.lead_scores?.[0] ?? null;
  const website = lead.website_snapshots?.[0] ?? null;
  const instagram = lead.instagram_snapshots?.[0] ?? null;
  const demo = lead.ringbooker_demos?.[0] ?? null;
  const events = lead.outreach_events ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <Link href="/leads" className="text-xs text-muted hover:text-text">
            Back to leads
          </Link>
          <h1 className="mt-1 overflow-wrap-anywhere text-xl font-semibold text-text">{lead.name}</h1>
          <p className="text-sm text-muted">{lead.address ?? [lead.city, lead.state].filter(Boolean).join(", ")}</p>
        </div>
        <LeadActions leadId={lead.id} isAdmin={profile.role === "admin"} />
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Info label="Phone" value={lead.phone ? (
                <a href={`tel:${lead.phone}`} className="text-violet-700 hover:underline dark:text-violet-400">{lead.phone}</a>
              ) : null} />
              <Info label="Website" value={lead.website_url ? (
                <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="break-all text-violet-700 hover:underline dark:text-violet-400">{lead.website_url}</a>
              ) : null} />
              <Info label="Instagram" value={lead.instagram_url ? (
                <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer" className="text-violet-700 hover:underline dark:text-violet-400">{lead.instagram_url}</a>
              ) : null} />
              <Info label="Facebook" value={lead.facebook_url ? (
                <a href={lead.facebook_url} target="_blank" rel="noopener noreferrer" className="break-all text-violet-700 hover:underline dark:text-violet-400">{lead.facebook_url}</a>
              ) : null} />
              <Info label="TikTok" value={lead.tiktok_url ? (
                <a href={lead.tiktok_url} target="_blank" rel="noopener noreferrer" className="text-violet-700 hover:underline dark:text-violet-400">{lead.tiktok_url}</a>
              ) : null} />
              <Info label="Google rating" value={`${lead.rating ?? "-"} · ${lead.review_count ?? 0} reviews`} />
              <Info label="Sunday" value={lead.is_open_sunday == null ? "Unknown" : lead.is_open_sunday ? "Open" : "Closed"} />
              <Info label="Closes before 6PM" value={lead.closes_before_6pm == null ? "Unknown" : lead.closes_before_6pm ? "Yes" : "No"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Enrichment</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Info label="Website crawl" value={website?.status ?? "Not crawled"} />
              <Info label="Booking URLs" value={(website?.booking_urls ?? []).join(", ") || "None"} />
              <Info label="Platform hits" value={(website?.platform_hits ?? []).map((hit) => hit.platform).join(", ") || "None"} />
              <Info label="Instagram status" value={instagram?.status ?? "Not fetched"} />
              <Info label="IG followers" value={instagram?.followers?.toLocaleString() ?? "Unknown"} />
              <Info label="IG active last 30d" value={instagram?.active_last_30_days ? "Yes" : "No/unknown"} />
            </CardContent>
          </Card>

          <OutreachTimeline events={events} />
          <LogEventForm leadId={lead.id} />
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Score</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <ScoreBadge score={score?.score} priority={score?.priority} />
                <TierBadge tier={score?.tier} platform={score?.tier_platform} />
                <StatusBadge status={lead.status} />
              </div>
              {score ? <ScoreBreakdown factors={score.factors} /> : <p className="text-sm text-muted">Not scored yet.</p>}
              {score?.recommended_pitch ? <p className="text-sm text-muted">{score.recommended_pitch}</p> : null}
            </CardContent>
          </Card>
          <DemoCard demo={demo} />
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 break-words text-sm text-text">{value || "-"}</div>
    </div>
  );
}
