import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SalonLead } from "@/types";

type DemoLead = SalonLead & {
  website_snapshots?: Array<{
    booking_urls: string[] | null;
    hours_detected: Record<string, unknown> | null;
  }>;
};

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
  demoVertical: string;
  city: string;
  state: string;
  services: string[];
  staffNames: string[];
  primaryHours: string | null;
  bookingUrl: string | null;
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

function detectVertical(lead: SalonLead): string {
  const cats = [
    ...(lead.categories ?? []),
    lead.name ?? "",
  ].map((c) => c.toLowerCase());

  const joined = cats.join(" ");

  if (
    joined.includes("nail") ||
    joined.includes("manicure") ||
    joined.includes("pedicure")
  ) return "nail-salon";

  if (
    joined.includes("med spa") ||
    joined.includes("medical spa") ||
    joined.includes("medspa") ||
    joined.includes("botox") ||
    joined.includes("laser")
  ) return "med-spa";

  if (
    joined.includes("day spa") ||
    joined.includes("massage") ||
    joined.includes("wellness") ||
    joined.includes("spa") && !joined.includes("nail spa")
  ) return "day-spa";

  if (
    joined.includes("lash") ||
    joined.includes("brow") ||
    joined.includes("wax") ||
    joined.includes("threading")
  ) return "beauty-salon";

  if (
    joined.includes("barber") ||
    joined.includes("barbershop")
  ) return "barber";

  return "hair-salon";
}

export function buildDemoPayload(lead: DemoLead, options?: { notes?: string }): DemoPayload {
  return {
    salesLeadId: lead.id,
    salonName: lead.name,
    demoVertical: detectVertical(lead),
    city: lead.city ?? "",
    state: lead.state ?? "",
    services: ["Haircut & Style", "Hair Coloring", "Highlights & Balayage", "Blowout", "Hair Treatment"],
    staffNames: [],
    primaryHours: formatHours(lead.hours_raw),
    bookingUrl: lead.website_snapshots?.[0]?.booking_urls?.[0] ?? null,
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
  const { data: lead } = await adminClient
    .from("salon_leads")
    .select(`
      *,
      website_snapshots (
        booking_urls,
        hours_detected
      )
    `)
    .eq("id", leadId)
    .single<DemoLead>();
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
        demo_vertical: payload.demoVertical,
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

function formatHours(hoursRaw: Record<string, unknown> | null): string | null {
  if (!hoursRaw) return null;

  if (Array.isArray(hoursRaw.weekday_text) && hoursRaw.weekday_text.length > 0) {
    return (hoursRaw.weekday_text as string[]).join(", ");
  }

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

  const formatGroupedDayHours = (dayHours: Record<number, string>) => {
    if (Object.keys(dayHours).length === 0) return null;

    const dayNums = DAY_ORDER.filter((day) => dayHours[day]);
    const groups: Array<{ days: number[]; hours: string }> = [];

    for (const day of dayNums) {
      const hours = dayHours[day];
      const last = groups[groups.length - 1];
      const previousDay = last?.days[last.days.length - 1];
      const isNextDay = previousDay !== undefined && DAY_ORDER.indexOf(day) === DAY_ORDER.indexOf(previousDay) + 1;
      if (last && last.hours === hours && isNextDay) {
        last.days.push(day);
      } else {
        groups.push({ days: [day], hours });
      }
    }

    return groups
      .map(({ days, hours }) => {
        if (days.length === 1) return `${DAY_NAMES[days[0]]} ${hours}`;
        return `${DAY_NAMES[days[0]]}–${DAY_NAMES[days[days.length - 1]]} ${hours}`;
      })
      .join(", ");
  };

  const namedDayHours: Record<number, string> = {};
  for (const day of DAY_ORDER) {
    const value = hoursRaw[FULL_DAY_NAMES[day]];
    if (typeof value === "string" && value.trim()) {
      namedDayHours[day] = value.trim().replace(/\s+/g, " ");
    }
  }
  const namedHours = formatGroupedDayHours(namedDayHours);
  if (namedHours) return namedHours;

  if (!Array.isArray(hoursRaw.periods) || hoursRaw.periods.length === 0) return null;

  try {
    const periods = hoursRaw.periods as Array<{
      open: { day: number; time: string };
      close?: { day: number; time: string };
    }>;

    const dayHours: Record<number, string> = {};

    for (const period of periods) {
      const openDay = period.open?.day;
      const openTime = period.open?.time;
      const closeTime = period.close?.time;

      if (openDay === undefined || !openTime) continue;

      const formatTime = (t: string) => {
        const h = parseInt(t.slice(0, 2));
        const m = t.slice(2);
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return m === "00" ? `${h12}${ampm}` : `${h12}:${m}${ampm}`;
      };

      const open = formatTime(openTime);
      const close = closeTime ? formatTime(closeTime) : "close";
      dayHours[openDay] = `${open}–${close}`;
    }

    return formatGroupedDayHours(dayHours);
  } catch {
    return null;
  }
}
