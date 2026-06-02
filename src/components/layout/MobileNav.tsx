"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, KanbanSquare, Search, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

const items = [
  { href: "/", label: "Pipeline", icon: KanbanSquare, roles: ["admin", "outreacher", "viewer"] },
  { href: "/leads", label: "Leads", icon: Scissors, roles: ["admin", "outreacher", "viewer"] },
  { href: "/search", label: "Search", icon: Search, roles: ["admin"] },
  { href: "/demos", label: "Demos", icon: Bot, roles: ["admin", "outreacher"] },
] satisfies Array<{ href: string; label: string; icon: typeof Bot; roles: UserRole[] }>;

export function MobileNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const visible = items.filter((item) => item.roles.includes(role));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-surface md:hidden" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}>
      {visible.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex h-14 min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium",
              active ? "text-violet-700" : "text-muted",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
