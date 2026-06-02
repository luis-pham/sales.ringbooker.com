import { NextRequest, NextResponse } from "next/server";
import { requireLeadAccess } from "@/lib/auth/access";
import { getSessionUser } from "@/lib/auth/helpers";
import { createDemo } from "@/lib/demo/demo-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity } from "@/lib/utils/security";

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
