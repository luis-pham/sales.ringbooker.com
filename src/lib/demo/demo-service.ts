import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SalonLead } from "@/types";

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function extractSlug(demoUrl: string): string | null {
  try {
    const path = new URL(demoUrl).pathname.replace(/^\//, "").split("?")[0];
    return path || null;
  } catch {
    return null;
  }
}

export type DemoPayload = {
  salesLeadId: string;
  salonName: string;
  demoVertical: "hair-salon";
  city: string;
  state: string;
  services: string[];
  staffNames: string[];
  primaryHours: string | null;
  notes: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
};

export type DemoResult = {
  demoUrl: string;
  requestId: string | null;
  sessionId: string | null;
  expiresAt: string | null;
};

export function buildDemoPayload(lead: SalonLead, options?: { notes?: string }): DemoPayload {
  return {
    salesLeadId: lead.id,
    salonName: lead.name,
    demoVertical: "hair-salon",
    city: lead.city ?? "",
    state: lead.state ?? "",
    services: ["Haircut & Style", "Hair Coloring", "Highlights & Balayage", "Blowout", "Hair Treatment"],
    staffNames: [],
    primaryHours: formatHours(lead.hours_raw),
    notes: options?.notes ?? null,
    websiteUrl: lead.website_url,
    instagramUrl: lead.instagram_url,
  };
}

export async function callRingBookerDemoAPI(payload: DemoPayload): Promise<DemoResult> {
  if (env.ringbookerInternalApiUrl && env.ringbookerInternalApiKey) {
    const response = await fetch(`${env.ringbookerInternalApiUrl}/api/backend/internal/sales/demo-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Api-Key": env.ringbookerInternalApiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) throw new Error(`RingBooker API error ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const data = (await response.json()) as Record<string, unknown>;
    return {
      demoUrl: String(data.demoUrl ?? ""),
      requestId: typeof data.requestId === "string" ? data.requestId : null,
      sessionId: typeof data.sessionId === "string" ? data.sessionId : null,
      expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null,
    };
  }

  const slug = toSlug(`${payload.salonName} ${payload.city}`);
  return {
    demoUrl: `https://ringbooker.com/${slug}`,
    requestId: null,
    sessionId: null,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function createDemo(leadId: string, createdBy: string | null, options?: { notes?: string }) {
  const adminClient = createAdminClient();
  const { data: lead } = await adminClient.from("salon_leads").select("*").eq("id", leadId).single<SalonLead>();
  if (!lead) throw new Error(`Lead not found: ${leadId}`);

  const payload = buildDemoPayload(lead, options);
  const result = await callRingBookerDemoAPI(payload);

  const { data: existing } = await adminClient
    .from("ringbooker_demos")
    .select("id")
    .eq("lead_id", leadId)
    .eq("status", "prepared")
    .maybeSingle<{ id: string }>();

  const demoSlug = extractSlug(result.demoUrl);

  if (existing) {
    await adminClient
      .from("ringbooker_demos")
      .update({
        demo_url: result.demoUrl,
        demo_slug: demoSlug,
        demo_config: payload,
        demo_url_params: { requestId: result.requestId, sessionId: result.sessionId },
        expires_at: result.expiresAt,
      })
      .eq("id", existing.id);
    return { demoId: existing.id, demoUrl: result.demoUrl };
  }

  const { data: demo, error } = await adminClient
    .from("ringbooker_demos")
    .insert({
      lead_id: leadId,
      salon_name: payload.salonName,
      demo_vertical: payload.demoVertical,
      demo_config: payload,
      demo_url: result.demoUrl,
      demo_slug: demoSlug,
      demo_url_params: { requestId: result.requestId, sessionId: result.sessionId },
      status: "prepared",
      expires_at: result.expiresAt,
      created_by: createdBy,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !demo) throw new Error(`Failed to save demo: ${error?.message ?? "unknown"}`);

  await adminClient.from("outreach_events").insert({
    lead_id: leadId,
    demo_id: demo.id,
    type: "demo_created",
    notes: `Demo URL created for ${payload.salonName}`,
    created_by: createdBy,
  });

  return { demoId: demo.id, demoUrl: result.demoUrl };
}

function formatHours(hoursRaw: Record<string, unknown> | null) {
  if (!hoursRaw || !Array.isArray(hoursRaw.periods)) return null;
  return `${hoursRaw.periods.length} Google Places periods`;
}
