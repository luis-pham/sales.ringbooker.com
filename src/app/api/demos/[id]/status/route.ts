import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canAccessDemo } from "@/lib/auth/access";
import { getSessionUser } from "@/lib/auth/helpers";
import { logOutreachEvent } from "@/lib/outreach/outreach-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceMutationSecurity } from "@/lib/utils/security";

const schema = z.object({
  status: z.enum(["prepared", "shared", "viewed", "completed", "expired"]),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const security = enforceMutationSecurity(request, { key: "demo:status", limit: 60, windowMs: 60_000 });
  if (security) return security;
  const { user, profile } = await getSessionUser();
  if (!user || !profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { id } = await params;
  const adminClient = createAdminClient();
  if (!(await canAccessDemo(adminClient, id, profile))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.status === "shared") updates.share_count = 1;
  if (parsed.data.status === "viewed") {
    updates.view_count = 1;
    updates.first_viewed_at = new Date().toISOString();
    updates.last_viewed_at = new Date().toISOString();
  }

  const { data, error } = await adminClient
    .from("ringbooker_demos")
    .update(updates)
    .eq("id", id)
    .select("id, lead_id")
    .single<{ id: string; lead_id: string }>();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Demo not found" }, { status: 404 });

  const eventType =
    parsed.data.status === "shared"
      ? "demo_shared"
      : parsed.data.status === "viewed"
        ? "demo_viewed"
        : parsed.data.status === "completed"
          ? "demo_completed"
          : "status_changed";
  await logOutreachEvent({
    leadId: data.lead_id,
    demoId: data.id,
    type: eventType,
    createdBy: user.id,
    notes: `Demo marked ${parsed.data.status}`,
  });

  return NextResponse.json({ data });
}
