import { NextRequest, NextResponse } from "next/server";
import { requireLeadAccess } from "@/lib/auth/access";
import { getSessionUser } from "@/lib/auth/helpers";
import { uploadEvidence, type EvidenceType } from "@/lib/outreach/evidence-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity } from "@/lib/utils/security";

export async function POST(request: NextRequest) {
  const security = enforceMutationSecurity(request, { key: "evidence:post", limit: 30, windowMs: 60_000 });
  if (security) return security;
  const { user, profile } = await getSessionUser();
  if (!user || !profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  const leadId = String(formData.get("leadId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  const adminClient = createAdminClient();
  try {
    await requireLeadAccess(adminClient, leadId, profile);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { data: event } = await adminClient
    .from("outreach_events")
    .select("id")
    .eq("id", eventId)
    .eq("lead_id", leadId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "Invalid event for lead" }, { status: 400 });

  const result = await uploadEvidence({
    leadId,
    eventId,
    type: (String(formData.get("type") ?? "other") as EvidenceType),
    file,
    notes: String(formData.get("notes") ?? "") || undefined,
    uploadedBy: user.id,
  });
  return NextResponse.json({ data: result });
}
