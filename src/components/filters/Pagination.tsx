"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PER_PAGE_OPTIONS = [10, 25, 50, 100, 200];

type Props = {
  total: number;
  page: number;
  perPage: number;
};

export function Pagination({ total, page, perPage }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  function set(key: string, value: string | number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, String(value));
    if (key === "per_page") params.set("page", "1");
    startTransition(() => {
      router.replace(`?${params.toString()}`);
    });
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted transition-opacity duration-150 ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="flex items-center gap-2">
        <span>Show</span>
        <select
          value={perPage}
          onChange={(e) => set("per_page", e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {PER_PAGE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span>/ {total.toLocaleString()} results</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => set("page", page - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface transition-colors hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-3 text-sm">
          {page} / {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => set("page", page + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface transition-colors hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
