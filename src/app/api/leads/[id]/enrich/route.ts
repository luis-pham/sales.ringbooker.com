import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { enqueueJob } from "@/lib/jobs/queue";
import { enforceMutationSecurity } from "@/lib/utils/security";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = enforceMutationSecurity(request, { key: "lead:enrich", limit: 30, windowMs: 60_000 });
  if (security) return security;
  const { profile } = await getSessionUser();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const jobId = await enqueueJob("enrich_lead", { leadId: id });
  return NextResponse.json({ data: { jobId, status: "queued" } });
}
