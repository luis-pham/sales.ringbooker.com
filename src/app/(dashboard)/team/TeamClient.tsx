"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function TeamClient({
  profiles,
  invitations,
}: {
  profiles: Array<{ id: string; email: string; role: string; is_active: boolean }>;
  invitations: Array<{ id: string; email: string; role: string; token: string; accepted_at: string | null }>;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("outreacher");
  const [loading, setLoading] = useState(false);

  async function invite() {
    setLoading(true);
    const response = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const json = (await response.json()) as { data?: { token: string }; error?: string };
    setLoading(false);
    if (!response.ok) {
      toast.error(json.error ?? "Invite failed");
      return;
    }
    toast.success(`Invite token: ${json.data?.token}`);
    setEmail("");
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Invite user</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
          <Select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="outreacher">Outreacher</option>
            <option value="viewer">Viewer</option>
          </Select>
          <Button onClick={invite} disabled={loading || !email} className="w-full">
            {loading ? "Inviting..." : "Create invite"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {profiles.map((profile) => (
              <div key={profile.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                <span className="font-medium text-text">{profile.email}</span>
                <span className="text-muted">{profile.role}{profile.is_active ? "" : " · inactive"}</span>
              </div>
            ))}
          </div>
          {invitations.length ? (
            <div className="space-y-2 border-t border-border pt-4">
              <div className="text-sm font-medium text-text">Invitations</div>
              {invitations.map((inviteRow) => (
                <div key={inviteRow.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="font-medium text-text">{inviteRow.email}</div>
                  <div className="text-xs text-muted">
                    {inviteRow.accepted_at ? "Accepted" : `Pending · /invite/${inviteRow.token}`}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
