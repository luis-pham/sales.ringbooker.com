import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity } from "@/lib/utils/security";

const schema = z.object({
  role: z.enum(["admin", "outreacher", "viewer"]).optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = enforceMutationSecurity(request, { key: "team:patch", limit: 30, windowMs: 60_000 });
  if (security) return security;
  const { profile } = await getSessionUser();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { id } = await params;
  if (id === profile.id && (parsed.data.is_active === false || (parsed.data.role && parsed.data.role !== "admin"))) {
    return NextResponse.json({ error: "Cannot remove your own admin access" }, { status: 400 });
  }
  const { data, error } = await createAdminClient()
    .from("profiles")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
