"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function LogEventForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [type, setType] = useState("dm_sent");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const response = await fetch(`/api/outreach/${leadId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, channel: "instagram_dm", notes }),
    });
    setLoading(false);
    if (!response.ok) {
      toast.error("Failed to log event");
      return;
    }
    toast.success("Event logged");
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <Select value={type} onChange={(event) => setType(event.target.value)}>
        <option value="dm_sent">DM sent</option>
        <option value="demo_shared">Demo shared</option>
        <option value="reply_received">Reply received</option>
        <option value="demo_completed">Demo completed</option>
        <option value="converted">Converted</option>
        <option value="lost">Lost</option>
        <option value="note">Note</option>
      </Select>
      <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" />
      <Button onClick={submit} disabled={loading}>
        {loading ? "Logging..." : "Log event"}
      </Button>
    </div>
  );
}
