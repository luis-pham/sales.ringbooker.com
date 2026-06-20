"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
  { value: "all", label: "All time" },
];

const PROVIDER_LABELS: Record<string, string> = {
  serper: "Search API",
  google_places: "Places API",
  apify: "Social API",
  cloudflare: "Browser API",
};

const ENDPOINT_LABELS: Record<string, string> = {
  maps_search: "Search businesses by location",
  reviews: "Fetch business reviews",
  web_search: "Search the web",
  place_details: "Fetch business details",
  instagram_scrape: "Fetch social profile",
  instagram_scrape_batch: "Fetch social profiles (batch)",
  browser_rendering_content: "Read page content",
  browser_rendering_markdown: "Extract page content",
};

const PROVIDER_COLORS: Record<string, string> = {
  serper: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  google_places: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  apify: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

type LogRow = {
  id: string;
  provider: string;
  endpoint: string;
  units: number;
  estimated_cost_usd: number;
  status: string;
  search_run_id: string | null;
  lead_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type Props = {
  logs: LogRow[];
  byProvider: Record<string, { calls: number; cost: number }>;
  totalCalls: number;
  totalCost: number;
  range: string;
};

function toTitleLabel(value: string) {
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getProviderLabel(provider: string) {
  return PROVIDER_LABELS[provider] ?? `${toTitleLabel(provider)} API`;
}

function getEndpointLabel(endpoint: string) {
  return ENDPOINT_LABELS[endpoint] ?? toTitleLabel(endpoint);
}

export function LogsClient({ logs, byProvider, totalCalls, totalCost, range }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setRange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", value);
    router.push(`?${params.toString()}`);
  }

  const providerEntries = Object.entries(byProvider).sort((a, b) => b[1].calls - a[1].calls);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">API Usage Logs</h1>
        <p className="text-sm text-muted">Monitor external API calls and estimated costs.</p>
      </div>

      {/* Range filter */}
      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              range === r.value
                ? "bg-accent text-white"
                : "bg-surface-muted text-muted hover:text-text"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted">Total calls</div>
            <div className="mt-1 text-2xl font-semibold text-text">{totalCalls.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted">Est. cost</div>
            <div className="mt-1 text-2xl font-semibold text-text">${totalCost.toFixed(3)}</div>
          </CardContent>
        </Card>
        {providerEntries.slice(0, 2).map(([provider, stats]) => (
          <Card key={provider}>
            <CardContent className="p-4">
              <div className="text-xs text-muted">{getProviderLabel(provider)}</div>
              <div className="mt-1 text-2xl font-semibold text-text">{stats.calls.toLocaleString()}</div>
              <div className="text-xs text-muted">${stats.cost.toFixed(3)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Provider breakdown */}
      {providerEntries.length > 0 && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3 text-sm font-medium text-text">By provider</div>
          <div className="divide-y divide-border">
            {providerEntries.map(([provider, stats]) => (
              <div key={provider} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PROVIDER_COLORS[provider] ?? "bg-surface-muted text-muted"}`}>
                    {getProviderLabel(provider)}
                  </span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-text font-medium">{stats.calls.toLocaleString()} calls</span>
                  <span className="w-20 text-right text-muted">${stats.cost.toFixed(3)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent calls table */}
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3 text-sm font-medium text-text">
          Recent calls ({logs.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Endpoint</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Context</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                    No API calls in this period.
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROVIDER_COLORS[log.provider] ?? "bg-surface-muted text-muted"}`}>
                      {getProviderLabel(log.provider)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{getEndpointLabel(log.endpoint)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${log.status === "success" ? "text-success" : "text-danger"}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {log.search_run_id ? (
                      <Link href={`/search/${log.search_run_id}`} className="text-violet-600 hover:underline">
                        Run
                      </Link>
                    ) : log.lead_id ? (
                      <Link href={`/leads/${log.lead_id}`} className="text-violet-600 hover:underline">
                        Lead
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted">
                    ${Number(log.estimated_cost_usd).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
