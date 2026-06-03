"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

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
  const [copied, setCopied] = useState<string | null>(null);

  async function invite() {
    if (!email.trim()) return;
    setLoading(true);
    const response = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role }),
    });
    const json = (await response.json()) as { data?: { token: string }; error?: string };
    setLoading(false);
    if (!response.ok) {
      toast.error(json.error ?? "Invite failed");
      return;
    }
    toast.success(`Invite sent for ${email.trim()}. They can now sign in with Google.`);
    setEmail("");
    router.refresh();
  }

  async function copyLink(token: string) {
    const link = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(link);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  const pending = invitations.filter((i) => !i.accepted_at);
  const accepted = invitations.filter((i) => i.accepted_at);

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      {/* Invite form */}
      <Card>
        <CardHeader>
          <CardTitle>Invite user</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && invite()}
            placeholder="name@gmail.com"
          />
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="outreacher">Outreacher</option>
            <option value="viewer">Viewer</option>
          </Select>
          <Button onClick={invite} disabled={loading || !email.trim()} className="w-full">
            {loading ? "Inviting…" : "Send invite"}
          </Button>
          <p className="text-xs text-muted">
            After adding their email here, they can sign in directly with that Google account — no link needed.
          </p>
        </CardContent>
      </Card>

      {/* User lists */}
      <div className="space-y-4">
        {/* Active members */}
        <Card>
          <CardHeader>
            <CardTitle>Members ({profiles.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {profiles.length === 0 && (
              <p className="text-sm text-muted">No members yet.</p>
            )}
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <div className="text-sm font-medium text-text">{p.email}</div>
                  <div className="text-xs text-muted capitalize">{p.role}</div>
                </div>
                <Badge variant={p.is_active ? "emerald" : "slate"}>
                  {p.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Pending invitations */}
        {pending.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pending invites ({pending.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pending.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <div className="text-sm font-medium text-text">{inv.email}</div>
                    <div className="text-xs text-muted capitalize">{inv.role} · Waiting for Google sign-in</div>
                  </div>
                  <button
                    onClick={() => copyLink(inv.token)}
                    title="Copy invite link (fallback)"
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-surface-muted hover:text-text"
                  >
                    {copied === inv.token
                      ? <><Check className="h-3 w-3 text-emerald-600" /> Copied</>
                      : <><Copy className="h-3 w-3" /> Link</>
                    }
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Accepted invitations */}
        {accepted.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Accepted invites ({accepted.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {accepted.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-md border border-border p-3">
                  <div className="text-sm font-medium text-text">{inv.email}</div>
                  <Badge variant="emerald">Accepted</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
