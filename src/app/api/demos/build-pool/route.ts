import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity } from "@/lib/utils/security";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function vnNow() {
  return new Date(Date.now() - VN_OFFSET_MS * -1);
}

function startOfTodayVnIso() {
  const shifted = vnNow();
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - VN_OFFSET_MS).toISOString();
}

async function getPreparedDemoLeadIds(db: any): Promise<string[]> {
  const { data } = await db
    .from("ringbooker_demos")
    .select("lead_id")
    .eq("status", "prepared");

  return Array.from(new Set((data ?? []).map((d: any) => d.lead_id as string).filter(Boolean)));
}

async function countPreparedUnassigned(db: any, preparedDemoIds: string[]): Promise<number> {
  if (preparedDemoIds.length === 0) return 0;

  const { count } = await db
    .from("salon_leads")
    .select("id", { count: "exact", head: true })
    .eq("status", "outreach_ready")
    .eq("sales_stage", "ready")
    .is("assigned_to", null)
    .in("id", preparedDemoIds);

  return count ?? 0;
}

export async function POST(request: NextRequest) {
  const security = enforceMutationSecurity(request, { key: "demos:build-pool", limit: 10, windowMs: 60_000 });
  if (security) return security;

  const { user, profile } = await getSessionUser();
  if (!user || profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = createAdminClient();
  const [
    { data: config, error: configError },
    { data: outreachers, error: outreachersError },
    { count: assignedToday, error: assignedTodayError },
    preparedDemoIds,
  ] = await Promise.all([
    db.from("assignment_config").select("max_per_day").eq("id", true).maybeSingle(),
    db.from("profiles")
      .select("id")
      .eq("role", "outreacher")
      .eq("is_active", true),
    db.from("salon_leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "outreach_ready")
      .gte("assigned_at", startOfTodayVnIso()),
    getPreparedDemoLeadIds(db),
  ]);

  if (configError || outreachersError || assignedTodayError) {
    return NextResponse.json({ error: "Failed to calculate demo pool" }, { status: 500 });
  }

  const preparedUnassigned = await countPreparedUnassigned(db, preparedDemoIds);
  const maxPerDay = config?.max_per_day ?? 20;
  const outreacherCount = outreachers?.length ?? 0;
  const totalCapacity = outreacherCount * maxPerDay;
  const needed = totalCapacity - (assignedToday ?? 0) - preparedUnassigned;

  if (needed <= 0) {
    return NextResponse.json({
      status: "sufficient",
      message: "Pool đã đủ demo cho hôm nay",
      preparedUnassigned,
      totalCapacity,
    });
  }

  const toCreate = Math.min(Math.ceil(needed * 1.5), 200);
  const excludeIds = new Set(preparedDemoIds);

  const { data: candidates } = await db
    .from("lead_scores")
    .select("lead_id, priority, score, salon_leads!inner(assigned_to, has_social, sales_stage, status)")
    .in("priority", [1, 2, 3])
    .eq("salon_leads.status", "outreach_ready")
    .is("salon_leads.assigned_to", null)
    .eq("salon_leads.has_social", true)
    .eq("salon_leads.sales_stage", "ready")
    .order("priority", { ascending: true })
    .order("score", { ascending: false })
    .limit(toCreate * 2);

  const seen = new Set<string>();
  const leadIds: string[] = [];
  for (const candidate of candidates ?? []) {
    const leadId = candidate.lead_id as string;
    if (!leadId || excludeIds.has(leadId) || seen.has(leadId)) continue;
    seen.add(leadId);
    leadIds.push(leadId);
    if (leadIds.length >= toCreate) break;
  }

  if (leadIds.length === 0) {
    return NextResponse.json({
      status: "no_leads",
      message: "Không có lead đủ điều kiện để tạo demo",
    });
  }

  const jobs = leadIds.map((leadId) => ({
    type: "auto_create_demo",
    payload: { leadId, createdBy: user.id },
    status: "pending",
    max_attempts: 3,
  }));

  const { error } = await db.from("jobs").insert(jobs);
  if (error) return NextResponse.json({ error: "Failed to queue jobs" }, { status: 500 });

  return NextResponse.json({
    status: "queued",
    queued: leadIds.length,
    needed,
    totalCapacity,
    message: `Đã queue ${leadIds.length} demo để tạo`,
  });
}
