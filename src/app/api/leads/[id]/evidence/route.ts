/**
 * GET /api/leads/[id]/evidence — evidence files for a lead, with short-lived signed
 * URLs (the bucket is private). Accessible to admins and the lead's assigned rep.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireLeadAccess } from "@/lib/auth/access";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/utils/security";

type EvidenceRow = {
  id: string;
  event_id: string | null;
  type: string;
  storage_path: string;
  file_name: string | null;
  uploaded_by: string | null;
  notes: string | null;
  created_at: string;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(request, { key: "lead:evidence:get", limit: 120, windowMs: 60_000 });
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

  const { data: rows } = await adminClient
    .from("outreach_evidence")
    .select("id, event_id, type, storage_path, file_name, uploaded_by, notes, created_at")
    .eq("lead_id", id)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<EvidenceRow[]>();

  const evidence = await Promise.all(
    (rows ?? []).map(async (r) => {
      const { data: signed } = await adminClient.storage
        .from("evidence")
        .createSignedUrl(r.storage_path, 3600);
      return {
        id: r.id,
        eventId: r.event_id,
        type: r.type,
        fileName: r.file_name,
        notes: r.notes,
        createdAt: r.created_at,
        url: signed?.signedUrl ?? null,
      };
    }),
  );

  return NextResponse.json({ data: evidence });
}
