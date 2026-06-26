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

type TeamRole = "admin" | "outreacher" | "viewer";
type ProfileRow = { id: string; email: string; role: TeamRole; is_active: boolean };

const ROLE_LABELS: Record<TeamRole, string> = {
  admin: "Quản trị viên",
  outreacher: "Outreacher",
  viewer: "Người xem",
};

export function TeamClient({
  profiles,
  invitations,
}: {
  profiles: ProfileRow[];
  invitations: Array<{ id: string; email: string; role: string; token: string; accepted_at: string | null }>;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("outreacher");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);

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
      toast.error(json.error ?? "Mời thất bại");
      return;
    }
    toast.success(`Đã gửi lời mời cho ${email.trim()}. Họ có thể đăng nhập bằng Google.`);
    setEmail("");
    router.refresh();
  }

  async function copyLink(token: string) {
    const link = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(link);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  async function updateMember(member: ProfileRow, updates: Partial<Pick<ProfileRow, "role" | "is_active">>) {
    setSavingMemberId(member.id);
    const response = await fetch(`/api/team/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    setSavingMemberId(null);
    if (!response.ok) {
      toast.error(json.error ?? "Cập nhật thất bại");
      return;
    }
    toast.success("Đã cập nhật thành viên");
    router.refresh();
  }

  const pending = invitations.filter((i) => !i.accepted_at);
  const accepted = invitations.filter((i) => i.accepted_at);

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      {/* Invite form */}
      <Card>
        <CardHeader>
          <CardTitle>Mời người dùng</CardTitle>
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
            <option value="viewer">Người xem</option>
          </Select>
          <Button onClick={invite} disabled={loading || !email.trim()} className="w-full">
            {loading ? "Đang mời…" : "Gửi lời mời"}
          </Button>
          <p className="text-xs text-muted">
            Sau khi thêm email ở đây, họ có thể đăng nhập trực tiếp bằng tài khoản Google đó — không cần link.
          </p>
        </CardContent>
      </Card>

      {/* User lists */}
      <div className="space-y-4">
        {/* Active members */}
        <Card>
          <CardHeader>
            <CardTitle>Thành viên ({profiles.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {profiles.length === 0 && (
              <p className="text-sm text-muted">Chưa có thành viên.</p>
            )}
            {profiles.map((p) => {
              const isSaving = savingMemberId === p.id;
              return (
                <div key={p.id} className="flex flex-col gap-3 rounded-md border border-border p-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text">{p.email}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant={p.is_active ? "emerald" : "slate"}>
                        {p.is_active ? "Đang hoạt động" : "Không hoạt động"}
                      </Badge>
                      <span className="text-xs text-muted">{ROLE_LABELS[p.role]}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Select
                      aria-label={`Vai trò của ${p.email}`}
                      value={p.role}
                      disabled={isSaving}
                      onChange={(event) => {
                        const nextRole = event.target.value as TeamRole;
                        if (nextRole !== p.role) updateMember(p, { role: nextRole });
                      }}
                      className="sm:w-36"
                    >
                      <option value="admin">Quản trị viên</option>
                      <option value="outreacher">Outreacher</option>
                      <option value="viewer">Người xem</option>
                    </Select>
                    <Button
                      type="button"
                      variant={p.is_active ? "danger" : "outline"}
                      size="sm"
                      disabled={isSaving}
                      onClick={() => updateMember(p, { is_active: !p.is_active })}
                      className="sm:w-28"
                    >
                      {isSaving ? "Đang lưu..." : p.is_active ? "Vô hiệu hóa" : "Kích hoạt"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Pending invitations */}
        {pending.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Lời mời đang chờ ({pending.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pending.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <div className="text-sm font-medium text-text">{inv.email}</div>
                    <div className="text-xs text-muted">{ROLE_LABELS[inv.role as TeamRole] ?? inv.role} · Chờ đăng nhập Google</div>
                  </div>
                  <button
                    onClick={() => copyLink(inv.token)}
                    title="Sao chép link mời (dự phòng)"
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-surface-muted hover:text-text"
                  >
                    {copied === inv.token
                      ? <><Check className="h-3 w-3 text-emerald-600" /> Đã sao chép</>
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
              <CardTitle>Lời mời đã chấp nhận ({accepted.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {accepted.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-md border border-border p-3">
                  <div className="text-sm font-medium text-text">{inv.email}</div>
                  <Badge variant="emerald">Đã chấp nhận</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
