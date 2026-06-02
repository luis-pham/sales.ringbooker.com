"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LeadActions({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function run(action: "enrich" | "score" | "demo") {
    setLoading(action);
    const response = await fetch(`/api/leads/${leadId}/${action}`, { method: "POST" });
    setLoading(null);
    if (!response.ok) {
      toast.error(`Failed to ${action}`);
      return;
    }
    toast.success(action === "demo" ? "Demo created" : `${action} queued`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => run("enrich")} disabled={Boolean(loading)}>
        <RefreshCw className="h-4 w-4" />
        {loading === "enrich" ? "Queueing..." : "Enrich"}
      </Button>
      <Button variant="outline" onClick={() => run("score")} disabled={Boolean(loading)}>
        <Star className="h-4 w-4" />
        {loading === "score" ? "Queueing..." : "Score"}
      </Button>
      <Button onClick={() => run("demo")} disabled={Boolean(loading)}>
        <Bot className="h-4 w-4" />
        {loading === "demo" ? "Building..." : "Build demo"}
      </Button>
    </div>
  );
}
