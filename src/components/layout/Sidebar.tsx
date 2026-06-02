"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  KanbanSquare,
  Search,
  Users,
  Scissors,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

const navItems = [
  { href: "/", label: "Pipeline", icon: KanbanSquare, roles: ["admin", "outreacher", "viewer"] },
  { href: "/leads", label: "Leads", icon: Scissors, roles: ["admin", "outreacher", "viewer"] },
  { href: "/search", label: "Search", icon: Search, roles: ["admin"] },
  { href: "/demos", label: "Demos", icon: Bot, roles: ["admin", "outreacher"] },
  { href: "/analytics", label: "Analytics", icon: BarChart3, roles: ["admin"] },
  { href: "/team", label: "Team", icon: Users, roles: ["admin"] },
] satisfies Array<{ href: string; label: string; icon: typeof LayoutDashboard; roles: UserRole[] }>;

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const visible = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-surface md:block">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
          R
        </div>
        <div>
          <div className="text-sm font-semibold text-text">RingBooker Sales</div>
          <div className="text-xs text-muted">Lead intelligence</div>
        </div>
      </div>
      <nav className="space-y-1 p-3">
        {visible.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                active ? "bg-violet-50 text-violet-700" : "text-muted hover:bg-surface-muted hover:text-text",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
