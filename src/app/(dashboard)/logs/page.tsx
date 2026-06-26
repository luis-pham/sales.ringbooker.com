import { requireRole } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { LogsClient } from "./LogsClient";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireRole("admin");
  const { range = "week" } = await searchParams;

  const since = rangeToDate(range);
  const adminClient = createAdminClient();

  const { data: rows } = await adminClient
    .from("api_usage_logs")
    .select("id, endpoint, provider, status, units, estimated_cost_usd, created_at, lead_id, job_id")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  const logs = (rows ?? []) as any[];

  // Aggregate by provider
  const byProvider: Record<string, { calls: number; cost: number }> = {};
  let totalCalls = 0;
  let totalCost = 0;
  for (const log of logs) {
    const p = log.provider as string;
    if (!byProvider[p]) byProvider[p] = { calls: 0, cost: 0 };
    byProvider[p]!.calls += 1;
    byProvider[p]!.cost += Number(log.estimated_cost_usd);
    totalCalls += 1;
    totalCost += Number(log.estimated_cost_usd);
  }

  return (
    <LogsClient
      logs={logs}
      byProvider={byProvider}
      totalCalls={totalCalls}
      totalCost={totalCost}
      range={range}
    />
  );
}

function rangeToDate(range: string): Date {
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === "week") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (range === "month") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return new Date(0); // all
}
