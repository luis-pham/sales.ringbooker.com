import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StageBadge } from "@/components/sales/StageBadge";
import { STAGE_ORDER, STAGE_META } from "@/lib/stageConfig";
import type { LeadStage } from "@/types";

const EVIDENCE_LABEL: Record<string, string> = {
  dm_screenshot: "DM", reply_screenshot: "Phản hồi", demo_shared_screenshot: "Đã chia sẻ demo",
  demo_viewed_confirm: "Đã xem demo", converted_proof: "Đã chuyển đổi", other: "Khác",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Quản trị viên",
  outreacher: "Outreacher",
  viewer: "Người xem",
};

function toStage(s: string | null): LeadStage {
  return (STAGE_ORDER as string[]).includes(s ?? "") ? (s as LeadStage) : "ready";
}

export default async function RepDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;
  const db = createAdminClient();

  const { data: profile } = await db
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .eq("id", id)
    .maybeSingle<{ id: string; full_name: string | null; email: string; role: string; is_active: boolean }>();
  if (!profile) notFound();

  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

  const [{ data: stageRows }, { data: leads }, { data: events }, { data: evidenceRows }] = await Promise.all([
    db.rpc("get_sales_stage_counts", { p_assigned_to: id }),
    db.from("salon_leads").select("id, name, city, state, sales_stage, updated_at").eq("assigned_to", id).order("updated_at", { ascending: false }).limit(100),
    db.from("outreach_events").select("id, type, notes, metadata, created_at, lead_id, salon_leads(name)").eq("created_by", id).order("created_at", { ascending: false }).limit(40),
    db.from("outreach_evidence").select("id, type, storage_path, created_at, lead_id, salon_leads(name)").eq("uploaded_by", id).order("created_at", { ascending: false }).limit(24),
  ]);

  const byStage: Record<string, number> = {};
  for (const r of (stageRows ?? []) as Array<{ stage: string; n: number }>) byStage[r.stage] = Number(r.n);
  const get = (s: string) => byStage[s] ?? 0;
  const total = Object.values(byStage).reduce((a, b) => a + b, 0);
  const inProgress = ["sent", "viewed", "hot", "replied", "signedup", "onboarding", "trial"].reduce((a, s) => a + get(s), 0);

  const dmsThisWeek = (events ?? []).filter(
    (e) => (e.metadata as any)?.sales_stage === "sent" && e.created_at >= weekAgo,
  ).length;

  const evidence = await Promise.all(
    (evidenceRows ?? []).map(async (r: any) => {
      const { data: signed } = await db.storage.from("evidence").createSignedUrl(r.storage_path, 3600);
      return { id: r.id, type: r.type, leadName: r.salon_leads?.name ?? "—", createdAt: r.created_at, url: signed?.signedUrl ?? null };
    }),
  );

  return (
    <div className="space-y-5">
      <div>
        <Link href="/analytics" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
          <ArrowLeft className="h-3.5 w-3.5" /> Quay lại tổng quan
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-text">{profile.full_name ?? profile.email}</h1>
        <p className="text-sm text-muted">
          {profile.email} · {ROLE_LABEL[profile.role] ?? profile.role}{profile.is_active ? "" : " · không hoạt động"}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Đã giao", total],
          ["Đang xử lý", inProgress],
          ["Đã chuyển đổi", get("converted")],
          ["DM tuần này", dmsThisWeek],
          ["Bằng chứng", evidence.length],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent className="p-4">
              <div className="text-xs text-muted">{label}</div>
              <div className="mt-1 text-2xl font-semibold text-text">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stage breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Pipeline của họ</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {STAGE_ORDER.map((stage) => {
              const n = get(stage);
              if (n === 0) return null;
              return (
                <span key={stage} className="flex items-center gap-1 text-xs text-muted">
                  <span className={`h-2 w-2 rounded-full ${STAGE_META[stage].dotColor}`} />
                  {STAGE_META[stage].label} <span className="font-medium text-text">{n}</span>
                </span>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Activity */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Hoạt động gần đây</CardTitle></CardHeader>
          <CardContent>
            {(events ?? []).length === 0 ? (
              <p className="text-sm text-muted">Chưa có hoạt động.</p>
            ) : (
              <ol className="space-y-3">
                {(events ?? []).map((e: any) => (
                  <li key={e.id} className="border-l-2 border-border pl-3">
                    <div className="text-sm text-text">
                      {(e.metadata?.timeline_type as string) ?? (e.type as string).replaceAll("_", " ")}
                      {e.salon_leads?.name ? <span className="text-muted"> · {e.salon_leads.name}</span> : null}
                    </div>
                    {e.notes ? <div className="text-xs text-muted">{e.notes}</div> : null}
                    <div className="mt-0.5 text-xs text-muted">{new Date(e.created_at).toLocaleString()}</div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Evidence gallery */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Bằng chứng ({evidence.length})</CardTitle></CardHeader>
          <CardContent>
            {evidence.length === 0 ? (
              <p className="text-sm text-muted">Chưa có bằng chứng.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {evidence.map((e) => (
                  <a key={e.id} href={e.url ?? "#"} target="_blank" rel="noopener noreferrer"
                    title={`${EVIDENCE_LABEL[e.type] ?? e.type} · ${e.leadName} · ${new Date(e.createdAt).toLocaleString()}`}
                    className="relative block overflow-hidden rounded-md border border-border">
                    {e.url
                      ? <img src={e.url} alt={e.type} className="aspect-square w-full object-cover" />
                      : <div className="flex aspect-square items-center justify-center bg-surface-muted text-xs text-muted">không có</div>}
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[10px] text-white">
                      {EVIDENCE_LABEL[e.type] ?? e.type}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lead list */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Lead đã giao ({(leads ?? []).length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5">Doanh nghiệp</th>
                  <th className="px-4 py-2.5">Địa điểm</th>
                  <th className="px-4 py-2.5">Giai đoạn</th>
                  <th className="px-4 py-2.5">Cập nhật</th>
                </tr>
              </thead>
              <tbody>
                {(leads ?? []).map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/leads/${l.id}`} prefetch={false} className="font-medium text-violet-700">{l.name}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{[l.city, l.state].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-4 py-2.5"><StageBadge stage={toStage(l.sales_stage)} /></td>
                    <td className="px-4 py-2.5 text-muted">{new Date(l.updated_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
