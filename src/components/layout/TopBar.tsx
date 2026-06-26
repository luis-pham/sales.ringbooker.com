import { AccountMenu } from "@/components/layout/AccountMenu";
import type { Profile } from "@/types";

const ROLE_LABELS: Record<Profile["role"], string> = {
  admin: "Quản trị viên",
  outreacher: "Outreacher",
  viewer: "Người xem",
};

export function TopBar({ profile }: { profile: Profile }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-4 md:px-6">
      <div>
        <div className="text-sm font-semibold text-text">Không gian bán hàng</div>
        <div className="text-xs text-muted">{ROLE_LABELS[profile.role]}</div>
      </div>
      <AccountMenu email={profile.email} />
    </header>
  );
}
