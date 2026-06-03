"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  ScrollText,
  Scissors,
  Search,
  Target,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

const navItems = [
  { href: "/sales", label: "Sales CRM", icon: Target, roles: ["admin", "outreacher", "viewer"] },
  { href: "/leads", label: "Leads", icon: Scissors, roles: ["admin", "outreacher", "viewer"] },
  { href: "/search", label: "Search", icon: Search, roles: ["admin"] },
  { href: "/demos", label: "Demos", icon: Bot, roles: ["admin", "outreacher"] },
  { href: "/analytics", label: "Analytics", icon: BarChart3, roles: ["admin"] },
  { href: "/team", label: "Team", icon: Users, roles: ["admin"] },
  { href: "/jobs", label: "Jobs", icon: BrainCircuit, roles: ["admin"] },
  { href: "/logs", label: "API Logs", icon: ScrollText, roles: ["admin"] },
] satisfies Array<{ href: string; label: string; icon: typeof LayoutDashboard; roles: UserRole[] }>;

export function Sidebar({
  role,
  collapsed,
  onToggle,
}: {
  role: UserRole;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const visible = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside
      className={cn(
        "hidden h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ease-in-out md:flex",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-border",
          collapsed ? "justify-center px-0" : "gap-2 px-5",
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
          R
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text">RingBooker Sales</div>
            <div className="text-xs text-muted">Lead intelligence</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {visible.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex h-10 items-center rounded-md text-sm font-medium transition-colors",
                collapsed ? "justify-center px-0" : "gap-3 px-3",
                active
                  ? "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                  : "text-muted hover:bg-surface-muted hover:text-text",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border p-2">
        <button
          onClick={onToggle}
          title={collapsed ? "Expand" : "Collapse"}
          className={cn(
            "flex h-9 w-full items-center rounded-md text-sm text-muted transition-colors hover:bg-surface-muted hover:text-text",
            collapsed ? "justify-center" : "gap-2 px-3",
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
