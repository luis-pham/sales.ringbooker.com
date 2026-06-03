"use client";

import { useState, useEffect } from "react";
import type { DemoTracking } from "@/types";

export function useDemoTracking(leadId: string | null) {
  const [tracking, setTracking] = useState<DemoTracking | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!leadId) { setTracking(null); return; }
    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/leads/${leadId}/demo`)
      .then((r) => r.json())
      .then((json: { data: DemoTracking | null }) => {
        if (!cancelled) setTracking(json.data ?? null);
      })
      .catch(() => { if (!cancelled) setTracking(null); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [leadId]);

  return { tracking, isLoading };
}
