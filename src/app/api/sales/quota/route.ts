/**
 * GET /api/sales/quota — rep-accessible daily DM progress.
 * Returns how many DMs the logged-in user has sent today and the daily target.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/utils/security";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { key: "sales:quota", limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { user, profile } = await getSessionUser();
  if (!user || !profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  // DMs sent today = timeline 'sent' events created by this user today.
  const { count } = await db
    .from("outreach_events")
    .select("id", { count: "exact", head: true })
    .eq("created_by", user.id)
    .eq("metadata->>timeline_type", "sent")
    .gte("created_at", startOfDay.toISOString());

  const { data: cfg } = await db
    .from("assignment_config")
    .select("max_per_day")
    .eq("id", true)
    .maybeSingle<{ max_per_day: number }>();

  return NextResponse.json({
    data: { sentToday: count ?? 0, target: cfg?.max_per_day ?? 20 },
  });
}
