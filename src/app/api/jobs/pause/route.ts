import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkerSettings } from "@/types";

type WorkerAction =
  | "pause"
  | "resume"
  | "pause_pipeline"
  | "resume_pipeline"
  | "pause_demo"
  | "resume_demo";

const ACTIONS: WorkerAction[] = [
  "pause",
  "resume",
  "pause_pipeline",
  "resume_pipeline",
  "pause_demo",
  "resume_demo",
];

// GET — fetch current worker paused state
export async function GET(request: NextRequest) {
  const { profile } = await getSessionUser();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data } = await createAdminClient()
    .from("worker_settings")
    .select("is_paused, pipeline_paused, demo_paused, paused_by, paused_at, updated_at")
    .eq("id", true)
    .single<WorkerSettings>();

  return NextResponse.json({
    data: data ?? {
      is_paused: false,
      pipeline_paused: false,
      demo_paused: false,
      paused_by: null,
      paused_at: null,
      updated_at: null,
    },
  });
}

// POST — pause or resume the worker
export async function POST(request: NextRequest) {
  const { profile } = await getSessionUser();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (!ACTIONS.includes(body.action as WorkerAction)) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const action = body.action as WorkerAction;
  const now = new Date().toISOString();
  const updates: Partial<WorkerSettings> = { updated_at: now };

  if (action === "pause") {
    updates.is_paused = true;
    updates.paused_by = profile.email;
    updates.paused_at = now;
  }
  if (action === "resume") {
    updates.is_paused = false;
    updates.pipeline_paused = false;
    updates.demo_paused = false;
    updates.paused_by = null;
    updates.paused_at = null;
  }
  if (action === "pause_pipeline") updates.pipeline_paused = true;
  if (action === "resume_pipeline") updates.pipeline_paused = false;
  if (action === "pause_demo") updates.demo_paused = true;
  if (action === "resume_demo") updates.demo_paused = false;

  const { data, error } = await createAdminClient()
    .from("worker_settings")
    .update(updates)
    .eq("id", true)
    .select("is_paused, pipeline_paused, demo_paused, paused_by, paused_at, updated_at")
    .single<WorkerSettings>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  console.log(`[WorkerControl] ${action} by ${profile.email}`);
  return NextResponse.json({ data });
}
