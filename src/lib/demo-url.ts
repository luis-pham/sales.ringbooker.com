const DEMO_BASE_URL = "https://ringbooker.com";

export function buildRingbookerDemoUrl(slug: string | null | undefined): string | null {
  const cleanSlug = slug?.trim().replace(/^\/+/, "");
  if (!cleanSlug) return null;

  const path = cleanSlug.startsWith("try/") ? cleanSlug : `try/${cleanSlug}`;
  return `${DEMO_BASE_URL}/${path}`;
}
