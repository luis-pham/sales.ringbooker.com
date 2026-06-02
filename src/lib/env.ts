function getEnv(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

export const env = {
  supabaseUrl: getEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  allowedEmailDomains: getEnv("ALLOWED_EMAIL_DOMAINS", "ringbooker.com")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean),
  internalApiSecret: getEnv("INTERNAL_API_SECRET"),
  cronSecret: getEnv("CRON_SECRET"),
  workerId: getEnv("WORKER_ID", `worker-${process.pid}`),
  workerPollIntervalMs: Number(getEnv("WORKER_POLL_INTERVAL_MS", "2000")),
  serperApiKey: getEnv("SERPER_API_KEY"),
  googlePlacesApiKey: getEnv("GOOGLE_PLACES_API_KEY"),
  apifyApiToken: getEnv("APIFY_API_TOKEN"),
  ringbookerInternalApiUrl: getEnv("RINGBOOKER_INTERNAL_API_URL"),
  ringbookerInternalApiKey: getEnv("RINGBOOKER_INTERNAL_API_KEY"),
  ringbookerWebhookSecret: getEnv("RINGBOOKER_WEBHOOK_SECRET"),
};
