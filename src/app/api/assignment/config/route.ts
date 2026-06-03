import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { VERTICAL_QUERIES } from "@/lib/config/search-targets";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity, enforceRateLimit } from "@/lib/utils/security";
import { getAssignmentConfig } from "@/lib/assignment/assignment-service";

const verticalKeys = Object.keys(VERTICAL_QUERIES) as [string, ...string[]];

const updateSchema = z.object({
  verticals: z.array(z.enum(verticalKeys)).min(1).optional(),
  max_per_day: z.coerce.number().int().min(1).max(500).optional(),
  priority_mode: z.enum(["p1_only", "p2_only", "p3_only", "waterfall"]).optional(),
  is_paused: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { key: "assignment:config:get", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const { profile } = await getSessionUser();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await getAssignmentConfig();
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const security = enforceMutationSecurity(request, { key: "assignment:config:post", limit: 30, windowMs: 60_000 });
  if (security) return security;
  const { profile } = await getSessionUser();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data, error } = await createAdminClient()
    .from("assignment_config")
    .update({ ...parsed.data, updated_by: profile.email, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
