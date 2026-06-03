import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireLeadAccess } from "@/lib/auth/access";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity } from "@/lib/utils/security";
import { STAGE_META } from "@/lib/stageConfig";

const schema = z.object({
  stage: z.enum([
    "ready", "sent", "viewed", "hot", "replied",
    "signedup", "onboarding", "trial", "converted", "ghosted", "churned",
  ]),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = enforceMutationSecurity(request, { key: "lead:stage", limit: 60, windowMs: 60_000 });
  if (security) return security;

  const { profile } = await getSessionUser();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const { id } = await params;
  const adminClient = createAdminClient();
  try {
    await requireLeadAccess(adminClient, id, profile);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { stage } = parsed.data;

  const { data: lead, error: updateErr } = await adminClient
    .from("salon_leads")
    .update({ sales_stage: stage, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, sales_stage")
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Auto-append timeline event
  await adminClient.from("outreach_events").insert({
    lead_id: id,
    type: "status_changed",
    notes: `Stage → ${STAGE_META[stage].label}`,
    metadata: { sales_stage: stage },
    new_status: stage,
    created_by: profile.id,
  });

  return NextResponse.json({ data: lead });
}
