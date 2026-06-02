import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadStatus, OutreachEventType } from "@/types";

const EVENT_TO_STATUS: Partial<Record<OutreachEventType, LeadStatus>> = {
  dm_sent: "dm_sent",
  email_sent: "dm_sent",
  demo_shared: "demo_shared",
  demo_viewed: "demo_viewed",
  demo_completed: "demo_completed",
  reply_received: "replied",
  converted: "converted",
  lost: "lost",
  disqualified: "disqualified",
};

const STATUS_ORDER: LeadStatus[] = [
  "new",
  "enriching",
  "enriched",
  "scored",
  "outreach_ready",
  "dm_sent",
  "replied",
  "demo_shared",
  "demo_viewed",
  "demo_completed",
  "follow_up_needed",
  "converted",
  "lost",
  "disqualified",
];

export async function logOutreachEvent(input: {
  leadId: string;
  type: OutreachEventType;
  channel?: string;
  notes?: string;
  demoId?: string;
  metadata?: Record<string, unknown>;
  createdBy: string | null;
}) {
  const adminClient = createAdminClient();
  const { data: lead } = await adminClient
    .from("salon_leads")
    .select("id, status")
    .eq("id", input.leadId)
    .single<{ id: string; status: LeadStatus }>();
  if (!lead) throw new Error(`Lead not found: ${input.leadId}`);

  const nextStatus = EVENT_TO_STATUS[input.type];
  const { data: event, error } = await adminClient
    .from("outreach_events")
    .insert({
      lead_id: input.leadId,
      demo_id: input.demoId ?? null,
      type: input.type,
      channel: input.channel ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
      prev_status: lead.status,
      new_status: nextStatus ?? null,
      created_by: input.createdBy,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !event) throw new Error(`Failed to log event: ${error?.message ?? "unknown"}`);

  if (nextStatus && canTransition(lead.status, nextStatus)) {
    const updates: Record<string, unknown> = { status: nextStatus };
    if (["dm_sent", "replied", "demo_shared"].includes(nextStatus)) updates.last_outreach_at = new Date().toISOString();
    if (nextStatus === "converted") updates.converted_at = new Date().toISOString();
    await adminClient.from("salon_leads").update(updates).eq("id", input.leadId);
  }

  return event.id;
}

export async function scheduleFollowUp(input: {
  leadId: string;
  assignedTo: string;
  scheduledFor: Date;
  type: string;
  notes?: string;
  createdBy: string;
}) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("follow_ups")
    .insert({
      lead_id: input.leadId,
      assigned_to: input.assignedTo,
      scheduled_for: input.scheduledFor.toISOString(),
      type: input.type,
      notes: input.notes ?? null,
      status: "pending",
      created_by: input.createdBy,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error(`Failed to schedule follow-up: ${error?.message ?? "unknown"}`);
  await adminClient.from("salon_leads").update({ status: "follow_up_needed" }).eq("id", input.leadId);
  return data.id;
}

function canTransition(current: LeadStatus, next: LeadStatus) {
  if (["converted", "lost", "disqualified"].includes(current)) return false;
  if (next === "follow_up_needed") return true;
  return STATUS_ORDER.indexOf(next) > STATUS_ORDER.indexOf(current);
}
