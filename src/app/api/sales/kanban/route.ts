import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/utils/security";
import type { LeadStage, PipelineLead, Profile } from "@/types";

const STAGES: LeadStage[] = ["ready", "sent", "viewed", "hot", "replied", "converted"];

const LEAD_SELECT = `
  id,
  name,
  city,
  state,
  categories,
  assigned_to,
  sales_stage,
  updated_at,
  created_at,
  instagram_url,
  facebook_url,
  ringbooker_demos ( id, demo_slug, view_count, last_viewed_at )
`;

const ADMIN_LEAD_SELECT = `
  ${LEAD_SELECT},
  assigned_profile:profiles!salon_leads_assigned_to_fkey ( full_name )
`;

type KanbanLead = PipelineLead & {
  city: string | null;
  state: string | null;
  sales_stage: LeadStage;
  assigned_to: string | null;
  updated_at: string;
  assignedRepName?: string | null;
};

function toLeadStage(raw: string | null): LeadStage {
  const valid: LeadStage[] = [
    "ready", "sent", "viewed", "hot", "replied",
    "signedup", "onboarding", "trial", "converted", "ghosted", "churned",
  ];
  return valid.includes(raw as LeadStage) ? (raw as LeadStage) : "ready";
}

function toKanbanLead(row: any, isAdmin: boolean): KanbanLead {
  const demo = row.ringbooker_demos?.[0] ?? null;
  const stage = toLeadStage(row.sales_stage);
  const platform: PipelineLead["platform"] = row.instagram_url
    ? "Instagram"
    : row.facebook_url
    ? "Facebook"
    : null;

  return {
    id: row.id,
    name: row.name,
    city: row.city ?? null,
    state: row.state ?? null,
    sales_stage: stage,
    assigned_to: row.assigned_to ?? null,
    updated_at: row.updated_at,
    assignedRepName: isAdmin ? row.assigned_profile?.full_name ?? null : null,
    location: [row.city, row.state].filter(Boolean).join(", ") || "Unknown",
    platform,
    handle: null,
    followers: null,
    businessType: (row.categories as string[] | null)?.[0] ?? null,
    stage,
    demo: demo
      ? {
          demoId: demo.id,
          slug: demo.demo_slug ?? "",
          plays: demo.view_count ?? 0,
          pct: 0,
          lastSeen: demo.last_viewed_at ?? null,
          sessions: [],
        }
      : null,
    timeline: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function scopedQuery(query: any, profile: Profile, stage: LeadStage) {
  let q = query.eq("sales_stage", stage).eq("status", "outreach_ready");
  if (profile.role !== "admin") q = q.eq("assigned_to", profile.id);
  return q;
}

async function getStage(profile: Profile, stage: LeadStage) {
  const db = createAdminClient();
  const isAdmin = profile.role === "admin";

  const [countResult, leadsResult] = await Promise.all([
    scopedQuery(
      db.from("salon_leads").select("id", { count: "exact", head: true }),
      profile,
      stage,
    ),
    scopedQuery(
      db.from("salon_leads")
        .select(isAdmin ? ADMIN_LEAD_SELECT : LEAD_SELECT)
        .order("updated_at", { ascending: false })
        .order("last_viewed_at", { referencedTable: "ringbooker_demos", ascending: false })
        .limit(1, { referencedTable: "ringbooker_demos" })
        .limit(8),
      profile,
      stage,
    ),
  ]);

  return {
    count: countResult.count ?? 0,
    leads: (leadsResult.data ?? []).map((row: any) => toKanbanLead(row, isAdmin)),
  };
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { key: "sales:kanban", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { profile } = await getSessionUser();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groups = await Promise.all(STAGES.map((stage) => getStage(profile, stage)));
  const data = STAGES.reduce<Record<string, (typeof groups)[number]>>((acc, stage, index) => {
    acc[stage] = groups[index];
    return acc;
  }, {});

  return NextResponse.json({ data });
}
