function getServerEnv(name: string, fallback = "") {
  if (typeof window !== "undefined") return fallback;
  return process.env[name] ?? fallback;
}

function parseAllowedDomains(value: string | undefined) {
  const domains = (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => (entry.includes("@") ? entry.split("@").pop() ?? "" : entry))
    .filter(Boolean);

  return domains.length > 0 ? domains : ["ringbooker.com"];
}

const defaultWorkerId =
  typeof process !== "undefined" && typeof process.pid === "number" ? `worker-${process.pid}` : "worker-browser";

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: getServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
  allowedEmailDomains: parseAllowedDomains(getServerEnv("ALLOWED_EMAIL_DOMAINS")),
  internalApiSecret: getServerEnv("INTERNAL_API_SECRET"),
  cronSecret: getServerEnv("CRON_SECRET"),
  workerId: getServerEnv("WORKER_ID", defaultWorkerId),
  workerPollIntervalMs: Number(getServerEnv("WORKER_POLL_INTERVAL_MS", "2000")),
  serperApiKey: getServerEnv("SERPER_API_KEY"),
  googlePlacesApiKey: getServerEnv("GOOGLE_PLACES_API_KEY"),
  apifyApiToken: getServerEnv("APIFY_API_TOKEN"),
  cloudflareAccountId: getServerEnv("CLOUDFLARE_ACCOUNT_ID"),
  cloudflareBrowserToken: getServerEnv("CLOUDFLARE_BROWSER_TOKEN"),
  ringbookerInternalApiUrl: getServerEnv("RINGBOOKER_INTERNAL_API_URL"),
  ringbookerInternalApiKey: getServerEnv("RINGBOOKER_INTERNAL_API_KEY"),
  ringbookerWebhookSecret: getServerEnv("RINGBOOKER_WEBHOOK_SECRET"),
};
