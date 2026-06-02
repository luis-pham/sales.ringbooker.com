import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, sendInvitation } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity, enforceRateLimit } from "@/lib/utils/security";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["outreacher", "viewer"]).default("outreacher"),
});

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { key: "team:get", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const { profile } = await getSessionUser();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminClient = createAdminClient();
  const [{ data: profiles }, { data: invitations }] = await Promise.all([
    adminClient.from("profiles").select("*").order("created_at", { ascending: false }),
    adminClient.from("invitations").select("*").order("created_at", { ascending: false }),
  ]);
  return NextResponse.json({ data: { profiles: profiles ?? [], invitations: invitations ?? [] } });
}

export async function POST(request: NextRequest) {
  const security = enforceMutationSecurity(request, { key: "team:post", limit: 20, windowMs: 60_000 });
  if (security) return security;
  const { user, profile } = await getSessionUser();
  if (!user || profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = inviteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const result = await sendInvitation(parsed.data.email, parsed.data.role, user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result });
}
