import { env } from "@/lib/env";
import { normalizePhone, normalizeUrl } from "@/lib/providers/serper";

const PLACES_BASE = "https://places.googleapis.com/v1";
const DETAIL_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "nationalPhoneNumber",
  "websiteUri",
  "regularOpeningHours",
  "currentOpeningHours",
  "rating",
  "userRatingCount",
  "googleMapsUri",
  "types",
].join(",");

export type PlaceDetails = {
  phone: string | null;
  website_url: string | null;
  hours_raw: Record<string, unknown> | null;
  is_open_sunday: boolean | null;
  closes_before_6pm: boolean | null;
  formatted_hours: string | null;
  rating: number | null;
  review_count: number | null;
  instagram_url: string | null;
};

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  if (!env.googlePlacesApiKey || !placeId) return null;

  const response = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": env.googlePlacesApiKey,
      "X-Goog-FieldMask": DETAIL_FIELDS,
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) return null;
  const data = (await response.json()) as Record<string, unknown>;
  const hours = getObject(data.regularOpeningHours) ?? getObject(data.currentOpeningHours);
  const parsedHours = parseGoogleHours(hours);

  return {
    phone: typeof data.nationalPhoneNumber === "string" ? normalizePhone(data.nationalPhoneNumber) : null,
    website_url: typeof data.websiteUri === "string" ? normalizeUrl(data.websiteUri) : null,
    hours_raw: hours,
    is_open_sunday: parsedHours.isOpenSunday,
    closes_before_6pm: parsedHours.closesBefore6PM,
    formatted_hours: parsedHours.formattedHours,
    rating: typeof data.rating === "number" ? data.rating : null,
    review_count: typeof data.userRatingCount === "number" ? data.userRatingCount : null,
    instagram_url: null,
  };
}

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function parseGoogleHours(hoursRaw: Record<string, unknown> | null): {
  isOpenSunday: boolean | null;
  closesBefore6PM: boolean | null;
  formattedHours: string | null;
} {
  const periods = Array.isArray(hoursRaw?.periods) ? (hoursRaw.periods as Array<Record<string, any>>) : [];
  if (periods.length === 0) {
    return { isOpenSunday: null, closesBefore6PM: null, formattedHours: null };
  }

  const isOpenSunday = periods.some((period) => period.open?.day === 0);
  const weekdays = periods.filter((period) => period.open?.day >= 1 && period.open?.day <= 5);
  const closesBefore6PM =
    weekdays.length > 0 ? weekdays.every((period) => (period.close?.hour ?? 24) < 18) : null;

  return {
    isOpenSunday,
    closesBefore6PM,
    formattedHours: formatPeriods(periods),
  };
}

function formatPeriods(periods: Array<Record<string, any>>) {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return periods
    .map((period) => {
      const day = dayNames[period.open?.day ?? 0] ?? "Day";
      const open = formatTime(period.open?.hour, period.open?.minute);
      const close = formatTime(period.close?.hour, period.close?.minute);
      return `${day} ${open}-${close}`;
    })
    .join(", ");
}

function formatTime(hour: number | undefined, minute: number | undefined) {
  if (hour == null) return "";
  const h = hour % 12 || 12;
  const m = String(minute ?? 0).padStart(2, "0");
  return `${h}:${m} ${hour < 12 ? "AM" : "PM"}`;
}
