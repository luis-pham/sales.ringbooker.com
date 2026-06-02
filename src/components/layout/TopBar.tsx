import { AccountMenu } from "@/components/layout/AccountMenu";
import type { Profile } from "@/types";

export function TopBar({ profile }: { profile: Profile }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-4 md:px-6">
      <div>
        <div className="text-sm font-semibold text-text">Sales workspace</div>
        <div className="text-xs text-muted">{profile.role}</div>
      </div>
      <AccountMenu email={profile.email} />
    </header>
  );
}
