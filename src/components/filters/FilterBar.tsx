"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const DATE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
];

export type SelectFilter = {
  paramKey: string;
  placeholder: string;
  options: { value: string; label: string }[];
};

type Props = {
  dateParamKey?: string;
  selects?: SelectFilter[];
};

export function FilterBar({ dateParamKey = "date", selects = [] }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const dateValue = searchParams.get(dateParamKey) ?? "all";

  function set(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    // reset to page 1 on filter change
    params.delete("page");
    startTransition(() => {
      router.replace(`?${params.toString()}`);
    });
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 transition-opacity duration-150 ${
        isPending ? "opacity-60 pointer-events-none" : ""
      }`}
    >
      {/* Date segmented control */}
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

      {/* Arbitrary select dropdowns */}
      {selects.map((s) => {
        const value = searchParams.get(s.paramKey) ?? "all";
        return (
          <select
            key={s.paramKey}
            value={value}
            onChange={(e) => set(s.paramKey, e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all">{s.placeholder}</option>
            {s.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      })}
    </div>
  );
}
