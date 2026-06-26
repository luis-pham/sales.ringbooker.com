"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACTION_LABELS = {
  enrich: "Làm giàu dữ liệu",
  score: "Chấm điểm",
  demo: "Demo",
} as const;

export function LeadActions({ leadId, isAdmin }: { leadId: string; isAdmin: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function run(action: "enrich" | "score" | "demo") {
    setLoading(action);
    const response = await fetch(`/api/leads/${leadId}/${action}`, { method: "POST" });
    setLoading(null);
    if (!response.ok) {
      toast.error(`${ACTION_LABELS[action]} thất bại`);
      return;
    }
    toast.success(action === "demo" ? "Đã tạo demo" : `${ACTION_LABELS[action]} đã vào hàng đợi`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {isAdmin ? (
        <>
          <Button variant="outline" onClick={() => run("enrich")} disabled={Boolean(loading)}>
            <RefreshCw className="h-4 w-4" />
            {loading === "enrich" ? "Đang đưa vào hàng đợi..." : "Làm giàu dữ liệu"}
          </Button>
          <Button variant="outline" onClick={() => run("score")} disabled={Boolean(loading)}>
            <Star className="h-4 w-4" />
            {loading === "score" ? "Đang đưa vào hàng đợi..." : "Chấm điểm"}
          </Button>
        </>
      ) : null}
      <Button onClick={() => run("demo")} disabled={Boolean(loading)}>
        <Bot className="h-4 w-4" />
        {loading === "demo" ? "Đang tạo..." : "Tạo demo"}
      </Button>
    </div>
  );
}
