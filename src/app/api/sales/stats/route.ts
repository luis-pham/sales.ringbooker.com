/**
 * GET /api/sales/stats — per-stage lead counts across the whole table (not the
 * 200-row CRM fetch). Admin = all leads; rep = their assigned leads.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/utils/security";
import type { LeadStage } from "@/types";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { key: "sales:stats", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { user, profile } = await getSessionUser();
  if (!user || !profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await createAdminClient().rpc("get_sales_stage_counts", {
    p_assigned_to: profile.role === "admin" ? null : user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byStage: Record<string, number> = {};
  let total = 0;
  for (const row of (data ?? []) as Array<{ stage: LeadStage; n: number }>) {
    byStage[row.stage] = Number(row.n);
    total += Number(row.n);
  }

  return NextResponse.json({ data: { byStage, total } });
}
