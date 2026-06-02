import { UserCircle } from "lucide-react";
import type { Profile } from "@/types";

export function TopBar({ profile }: { profile: Profile }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur md:px-6">
      <div>
        <div className="text-sm font-semibold text-text">Sales workspace</div>
        <div className="text-xs text-muted">{profile.role}</div>
      </div>
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted">
        <UserCircle className="h-5 w-5 shrink-0" />
        <span className="hidden truncate sm:block">{profile.email}</span>
      </div>
    </header>
  );
}
