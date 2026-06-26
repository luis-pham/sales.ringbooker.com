import { NextRequest, NextResponse } from "next/server";
import { requireLeadAccess } from "@/lib/auth/access";
import { getSessionUser } from "@/lib/auth/helpers";
import { createDemo } from "@/lib/demo/demo-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, enforceMutationSecurity } from "@/lib/utils/security";
import type { DemoTracking, DemoSession } from "@/types";

/** Return DemoTracking (demo stats + sessions) for the Sales CRM panel */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(_request, { key: "lead:demo:get", limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { profile } = await getSessionUser();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const adminClient = createAdminClient();
  try {
    await requireLeadAccess(adminClient, id, profile);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: demo } = await adminClient
    .from("ringbooker_demos")
    .select("id, demo_slug, view_count, last_viewed_at")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!demo) return NextResponse.json({ data: null });

  const { data: rawSessions } = await adminClient
    .from("demo_sessions")
    .select("id, started_at, hour_of_day, duration_seconds, pct_reached, is_complete")
    .eq("demo_id", demo.id)
    .order("started_at", { ascending: false })
    .limit(50);

  const sessions: DemoSession[] = (rawSessions ?? []).map((s) => {
    const dt = new Date(s.started_at);
    const totalSec = s.duration_seconds ?? 0;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return {
      id: s.id,
      date: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      time: dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
      hour: s.hour_of_day ?? dt.getHours(),
      duration: totalSec > 0 ? `${mins}m ${String(secs).padStart(2, "0")}s` : "—",
      pct: s.pct_reached,
    };
  });

  const tracking: DemoTracking = {
    demoId: demo.id,
    slug: demo.demo_slug ?? "",
    plays: demo.view_count ?? sessions.length,
    pct: sessions.reduce((max, s) => Math.max(max, s.pct), 0),
    lastSeen: demo.last_viewed_at,
    sessions,
  };

  return NextResponse.json({ data: tracking });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = enforceMutationSecurity(request, { key: "lead:demo", limit: 30, windowMs: 60_000 });
  if (security) return security;
  const { user, profile } = await getSessionUser();
  if (!user || !profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await requireLeadAccess(createAdminClient(), id, profile);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await createDemo(id, user.id);
  return NextResponse.json({ data });
}

/** PATCH /api/leads/[id]/demo — assigned rep marks the demo as quality-checked.
 *  Required before sending the DM (gates the ready → sent transition). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = enforceMutationSecurity(request, { key: "lead:demo:qa", limit: 30, windowMs: 60_000 });
  if (security) return security;
  const { user, profile } = await getSessionUser();
  if (!user || !profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const adminClient = createAdminClient();
  try {
    await requireLeadAccess(adminClient, id, profile);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: demo } = await adminClient
    .from("ringbooker_demos")
    .select("id")
    .eq("lead_id", id)
    .eq("status", "prepared")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (!demo) return NextResponse.json({ error: "No prepared demo to verify" }, { status: 400 });

  const { error } = await adminClient
    .from("ringbooker_demos")
    .update({ qa_checked_at: new Date().toISOString(), qa_checked_by: user.id })
    .eq("id", demo.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: { qaChecked: true } });
}
