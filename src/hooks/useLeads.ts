"use client";

import { useState, useEffect, useCallback } from "react";
import type { PipelineLead, LeadStage, TimelineEvent } from "@/types";

type RawLead = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  sales_stage: string | null;
  created_at: string;
  updated_at: string;
  instagram_snapshots?: Array<{ handle: string | null; followers: number | null }>;
  facebook_url?: string | null;
  instagram_url?: string | null;
  categories?: string[] | null;
  outreach_events?: Array<{
    id: string;
    type: string;
    notes: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
  ringbooker_demos?: Array<{
    id: string;
    demo_slug: string | null;
    view_count: number;
    last_viewed_at: string | null;
  }>;
};

function toLeadStage(raw: string | null): LeadStage {
  const valid: LeadStage[] = [
    "ready", "sent", "viewed", "hot", "replied",
    "signedup", "onboarding", "trial", "converted", "ghosted", "churned",
  ];
  return valid.includes(raw as LeadStage) ? (raw as LeadStage) : "ready";
}

function toPipelineLead(raw: RawLead): PipelineLead {
  const ig = raw.instagram_snapshots?.[0];
  const demo = raw.ringbooker_demos?.[0];
  const platform = ig ? "Instagram" : raw.facebook_url ? "Facebook" : null;
  const handle = ig?.handle ?? null;
  const followers = ig?.followers != null ? ig.followers.toLocaleString() : null;

  const timeline: TimelineEvent[] = (raw.outreach_events ?? []).map((e) => ({
    id: e.id,
    type: (e.metadata?.timeline_type as TimelineEvent["type"]) ?? (e.type === "note" ? "note" : "sent"),
    text: e.notes ?? e.type.replaceAll("_", " "),
    date: e.created_at,
  }));

  return {
    id: raw.id,
    name: raw.name,
    location: [raw.city, raw.state].filter(Boolean).join(", ") || "Unknown",
    platform,
    handle,
    followers,
    businessType: raw.categories?.[0] ?? null,
    stage: toLeadStage(raw.sales_stage),
    demo: demo
      ? {
          demoId: demo.id,
          slug: demo.demo_slug ?? "",
          plays: demo.view_count,
          pct: 0, // populated lazily via useDemoTracking
          lastSeen: demo.last_viewed_at,
          sessions: [],
        }
      : null,
    timeline,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function useLeads() {
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        "/api/leads?limit=100&include=instagram_snapshots,outreach_events,ringbooker_demos",
      );
      if (!res.ok) return;
      const json = await res.json() as { data: RawLead[] };
      setLeads((json.data ?? []).map(toPipelineLead));
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
