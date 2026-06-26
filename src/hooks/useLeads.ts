"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PipelineLead, LeadStage, TimelineEvent } from "@/types";

const LEADS_KEY = ["sales", "leads"] as const;

async function fetchLeads(): Promise<PipelineLead[]> {
  const res = await fetch("/api/sales/leads");
  if (!res.ok) throw new Error(`Failed to load leads (${res.status})`);
  const json = (await res.json()) as { data: PipelineLead[] };
  return json.data ?? [];
}

export function useLeads() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: LEADS_KEY,
    queryFn: fetchLeads,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  const leads = data ?? [];

  const setLeads = useCallback(
    (updater: (prev: PipelineLead[]) => PipelineLead[]) => {
      queryClient.setQueryData<PipelineLead[]>(LEADS_KEY, (prev) =>
        updater(prev ?? []),
      );
    },
    [queryClient],
  );

  const updateLeadStage = useCallback(
    async (leadId: string, stage: LeadStage) => {
      // Optimistic update
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage } : l)));
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) {
        // Roll back on failure
        await refetch();
      }
    },
    [setLeads, refetch],
  );

  const addTimelineEvent = useCallback(
    async (leadId: string, type: TimelineEvent["type"], text: string) => {
      const res = await fetch(`/api/leads/${leadId}/timeline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, text }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          data: { id: string; created_at: string };
        };
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
    },
    [setLeads],
  );

  return { leads, isLoading, updateLeadStage, addTimelineEvent, refetch };
}
