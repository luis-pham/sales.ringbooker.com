"use client";

import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RingbookerDemo } from "@/types";

export function DemoCard({ demo }: { demo: RingbookerDemo | null }) {
  if (!demo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Demo</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted">No demo created yet.</CardContent>
      </Card>
    );
  }

  async function copyUrl() {
    if (!demo?.demo_url) return;
    await navigator.clipboard.writeText(demo.demo_url);
    toast.success("Demo URL copied");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Demo</CardTitle>
        <Badge variant={demo.status === "prepared" ? "violet" : "emerald"}>{demo.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="break-all rounded-md border border-border bg-slate-50 p-3 text-sm text-text">
          {demo.demo_url ?? "Missing demo URL"}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={copyUrl}>
            <Copy className="h-4 w-4" />
            Copy
          </Button>
          {demo.demo_url ? (
            <Button variant="outline" onClick={() => window.open(demo.demo_url ?? "", "_blank", "noopener,noreferrer")}>
              <ExternalLink className="h-4 w-4" />
              Open
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
