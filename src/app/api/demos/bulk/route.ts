import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireLeadAccess } from "@/lib/auth/access";
import { getSessionUser } from "@/lib/auth/helpers";
import { createDemo } from "@/lib/demo/demo-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity } from "@/lib/utils/security";

const schema = z.object({ leadIds: z.array(z.string().uuid()).min(1).max(50) });

export async function POST(request: NextRequest) {
  const security = enforceMutationSecurity(request, { key: "demos:bulk", limit: 10, windowMs: 60_000 });
  if (security) return security;
  const { user, profile } = await getSessionUser();
  if (!user || profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const results = [];
  const adminClient = createAdminClient();
  for (const leadId of parsed.data.leadIds) {
    try {
      await requireLeadAccess(adminClient, leadId, profile);
      results.push({ leadId, ...(await createDemo(leadId, user.id)) });
    } catch (error) {
      results.push({ leadId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return NextResponse.json({ data: results });
}
