"use client";

import { useState, useEffect, useCallback } from "react";
import type { PipelineLead, LeadStage, TimelineEvent } from "@/types";

export function useLeads() {
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/sales/leads");
      if (!res.ok) return;
      const json = await res.json() as { data: PipelineLead[] };
      setLeads(json.data ?? []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const updateLeadStage = useCallback(async (leadId: string, stage: LeadStage) => {
    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => l.id === leadId ? { ...l, stage } : l),
    );
    const res = await fetch(`/api/leads/${leadId}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) {
      // Roll back on failure
      await fetch_();
    }
  }, [fetch_]);

  const addTimelineEvent = useCallback(async (
    leadId: string,
    type: TimelineEvent["type"],
    text: string,
  ) => {
    const res = await fetch(`/api/leads/${leadId}/timeline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, text }),
    });
    if (res.ok) {
      const json = await res.json() as { data: { id: string; created_at: string } };
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? {
                ...l,
                timeline: [
                  ...l.timeline,
                  { id: json.data.id, type, text, date: json.data.created_at },
                ],
              }
            : l,
        ),
      );
    }
  }, []);

  return { leads, isLoading, updateLeadStage, addTimelineEvent, refetch: fetch_ };
}
