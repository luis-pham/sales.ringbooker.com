"use client";

import { useRouter, useSearchParams } from "next/navigation";

const DATE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
];

type Props = {
  statusOptions?: { value: string; label: string }[];
  dateParamKey?: string;
  statusParamKey?: string;
};

export function FilterBar({
  statusOptions,
  dateParamKey = "date",
  statusParamKey = "status",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateValue = searchParams.get(dateParamKey) ?? "all";
  const statusValue = searchParams.get(statusParamKey) ?? "all";

  function set(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Date filter */}
      <div className="flex rounded-lg border border-border bg-surface overflow-hidden">
        {DATE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => set(dateParamKey, opt.value)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              dateValue === opt.value
                ? "bg-accent text-white"
                : "text-muted hover:bg-surface-muted hover:text-text"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Status filter */}
      {statusOptions && statusOptions.length > 0 && (
        <select
          value={statusValue}
          onChange={(e) => set(statusParamKey, e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="all">All statuses</option>
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
