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
    .select(`
      id, name, phone, address, city, state, categories,
      website_url, google_maps_url, rating, review_count,
      facebook_url, instagram_url, sales_stage, assigned_to,
      created_at, updated_at, enriched_at, scored_at,
      has_social, has_phone, closes_before_6pm, is_open_sunday,
      hours_raw, lat, lng, status,
      lead_scores(score, priority, tier, tier_platform, recommended_pitch, factors),
      website_snapshots(status, has_online_booking, has_phone_visible, booking_urls, instagram_links, facebook_links, crawled_at, error),
      instagram_snapshots(handle, followers, profile_url, bio, last_post_at, post_count_30d, active_last_30_days, booking_link_in_bio, detected_platform),
      ringbooker_demos(id, demo_slug, view_count, last_viewed_at),
      outreach_events(id, type, notes, metadata, created_at, created_by),
      follow_ups(id, type, notes, scheduled_for, completed_at, created_at)
    `)
    .eq("id", id)
    .order("last_viewed_at", { referencedTable: "ringbooker_demos", ascending: false })
    .limit(3, { referencedTable: "ringbooker_demos" })
    .order("created_at", { referencedTable: "outreach_events", ascending: false })
    .limit(20, { referencedTable: "outreach_events" })
    .order("scheduled_for", { referencedTable: "follow_ups", ascending: true })
    .limit(10, { referencedTable: "follow_ups" })
    .maybeSingle<LeadDetail>();

  if (error) {
    console.error("[lead-detail] Supabase error:", error.message, "id:", id);
    return (
      <div className="space-y-2 p-4">
        <div className="text-sm font-medium text-red-600">Không tải được lead</div>
        <div className="font-mono text-xs text-muted">{error.message}</div>
      </div>
    );
  }

  if (!lead) {
    return <div className="text-sm text-muted">Không tìm thấy lead (id: {id}).</div>;
  }

  if (profile.role !== "admin" && lead.assigned_to !== profile.id) {
    return <div className="text-sm text-muted">Bạn không có quyền truy cập lead này.</div>;
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
            Quay lại danh sách
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
              <CardTitle>Tổng quan</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Info label="Điện thoại" value={lead.phone ? (
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
              <Info label="Đánh giá Google" value={`${lead.rating ?? "-"} · ${lead.review_count ?? 0} đánh giá`} />
              <Info label="Chủ nhật" value={lead.is_open_sunday == null ? "Chưa rõ" : lead.is_open_sunday ? "Đang mở cửa" : "Đóng cửa"} />
              <Info label="Đóng trước 6PM" value={lead.closes_before_6pm == null ? "Chưa rõ" : lead.closes_before_6pm ? "Có" : "Không"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Làm giàu dữ liệu</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Info label="Crawl website" value={website?.status ?? "Chưa crawl"} />
              <Info label="URL đặt lịch" value={(website?.booking_urls ?? []).join(", ") || "Không có"} />
              <Info label="Nền tảng phát hiện" value={(website?.platform_hits ?? []).map((hit) => hit.platform).join(", ") || "Không có"} />
              <Info label="Trạng thái Instagram" value={instagram?.status ?? "Chưa lấy dữ liệu"} />
              <Info label="Người theo dõi IG" value={instagram?.followers?.toLocaleString() ?? "Chưa rõ"} />
              <Info label="IG hoạt động 30 ngày gần nhất" value={instagram?.active_last_30_days ? "Có" : "Không/chưa rõ"} />
            </CardContent>
          </Card>

          <OutreachTimeline events={events} />
          <LogEventForm leadId={lead.id} />
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Điểm</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <ScoreBadge score={score?.score} priority={score?.priority} />
                <TierBadge tier={score?.tier} platform={score?.tier_platform} />
                <StatusBadge status={lead.status} />
              </div>
              {score ? <ScoreBreakdown factors={score.factors} /> : <p className="text-sm text-muted">Chưa chấm điểm.</p>}
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
