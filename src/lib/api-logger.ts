import { createAdminClient } from "@/lib/supabase/admin";

export type ApiProvider = "serper" | "google_places" | "apify" | "cloudflare";

export type ApiLogEntry = {
  provider: ApiProvider;
  endpoint: string;
  units?: number;
  estimatedCostUsd: number;
  status?: "success" | "error";
  jobId?: string | null;
  searchRunId?: string | null;
  leadId?: string | null;
  metadata?: Record<string, unknown>;
};

// Fire-and-forget: logs API usage without blocking the caller
export function logApiCall(entry: ApiLogEntry): void {
  createAdminClient()
    .from("api_usage_logs")
    .insert({
      provider: entry.provider,
      endpoint: entry.endpoint,
      units: entry.units ?? 1,
      estimated_cost_usd: entry.estimatedCostUsd,
      status: entry.status ?? "success",
      job_id: entry.jobId ?? null,
      search_run_id: entry.searchRunId ?? null,
      lead_id: entry.leadId ?? null,
      metadata: entry.metadata ?? null,
    })
    .then(() => {}, () => {/* non-critical */});
}

// Cost constants (USD per unit)
export const API_COSTS = {
  serper_maps_page: 0.001,        // per page request
  serper_web_search: 0.001,       // per web search query
  serper_reviews: 0.003,          // per reviews query (estimate)
  google_places_details: 0.017,   // per place details call
  apify_instagram_run: 0.005,     // per actor run (estimate)
  cloudflare_markdown: 0.0001,    // per browser-rendering markdown call (estimate)
} as const;
