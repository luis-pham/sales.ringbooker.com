"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SearchPageClient() {
  const router = useRouter();
  const [city, setCity] = useState("Houston");
  const [state, setState] = useState("TX");
  const [maxResults, setMaxResults] = useState(50);
  const [loading, setLoading] = useState(false);

  async function runSearch() {
    setLoading(true);
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "hair salons", city, state, max_results: maxResults }),
    });
    const json = (await response.json()) as { data?: { searchRunId: string }; error?: string };
    setLoading(false);
    if (!response.ok || !json.data) {
      toast.error(json.error ?? "Search failed");
      return;
    }
    toast.success("Search queued");
    router.push(`/search/${json.data.searchRunId}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run Google Maps search</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[1fr_120px_140px_auto]">
        <div className="space-y-1">
          <Label>City</Label>
          <Input value={city} onChange={(event) => setCity(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>State</Label>
          <Input value={state} maxLength={2} onChange={(event) => setState(event.target.value.toUpperCase())} />
        </div>
        <div className="space-y-1">
          <Label>Max results</Label>
          <Input
            type="number"
            min={10}
            max={200}
            value={maxResults}
            onChange={(event) => setMaxResults(Number(event.target.value))}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={runSearch} disabled={loading} className="w-full">
            {loading ? "Queueing..." : "Start"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
