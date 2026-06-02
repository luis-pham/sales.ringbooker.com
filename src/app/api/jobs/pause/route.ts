import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — fetch current worker paused state
export async function GET(request: NextRequest) {
  const { profile } = await getSessionUser();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data } = await createAdminClient()
    .from("worker_settings")
    .select("is_paused, paused_by, paused_at")
    .eq("id", true)
    .single<{ is_paused: boolean; paused_by: string | null; paused_at: string | null }>();

  return NextResponse.json({ data: data ?? { is_paused: false, paused_by: null, paused_at: null } });
}

// POST — pause or resume the worker
export async function POST(request: NextRequest) {
  const { profile } = await getSessionUser();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "pause" && body.action !== "resume") {
    return NextResponse.json({ error: "action must be 'pause' or 'resume'" }, { status: 400 });
  }

  const isPaused = body.action === "pause";
  const now = new Date().toISOString();

  const { data, error } = await createAdminClient()
    .from("worker_settings")
    .update({
      is_paused: isPaused,
      paused_by: isPaused ? profile.email : null,
      paused_at: isPaused ? now : null,
      updated_at: now,
    })
    .eq("id", true)
    .select("is_paused, paused_by, paused_at")
    .single<{ is_paused: boolean; paused_by: string | null; paused_at: string | null }>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.log(`[WorkerControl] Worker ${isPaused ? "paused" : "resumed"} by ${profile.email}`);
  return NextResponse.json({ data });
}
