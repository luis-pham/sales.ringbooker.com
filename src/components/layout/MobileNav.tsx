"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  LayoutDashboard,
  MoreHorizontal,
  ScrollText,
  Scissors,
  Search,
  Share2,
  Target,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

// Primary = day-to-day work (bottom bar). Mirrors the desktop sidebar's main group.
const primaryItems = [
  { href: "/analytics", label: "Overview", icon: BarChart3, roles: ["admin"] },
  { href: "/sales", label: "Sales CRM", icon: Target, roles: ["admin", "outreacher", "viewer"] },
  { href: "/leads", label: "Leads", icon: Scissors, roles: ["admin", "outreacher", "viewer"] },
  { href: "/demos", label: "Demos", icon: Bot, roles: ["admin", "outreacher"] },
] satisfies Array<{ href: string; label: string; icon: typeof LayoutDashboard; roles: UserRole[] }>;

// Secondary = the "Settings" group, shown in the "More" sheet.
const secondaryItems = [
  { href: "/assignment", label: "Assignment", icon: Share2, roles: ["admin"] },
  { href: "/search", label: "Search", icon: Search, roles: ["admin"] },
  { href: "/team", label: "Team", icon: Users, roles: ["admin"] },
  { href: "/jobs", label: "Jobs", icon: BrainCircuit, roles: ["admin"] },
  { href: "/logs", label: "API Logs", icon: ScrollText, roles: ["admin"] },
] satisfies Array<{ href: string; label: string; icon: typeof LayoutDashboard; roles: UserRole[] }>;

export function MobileNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const visiblePrimary = primaryItems.filter((item) => (item.roles as string[]).includes(role));
  const visibleSecondary = secondaryItems.filter((item) => (item.roles as string[]).includes(role));

  function isActive(href: string) {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  return (
    <>
      {/* Bottom nav bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface md:hidden"
        style={{ gridTemplateColumns: `repeat(${visiblePrimary.length + (visibleSecondary.length > 0 ? 1 : 0)}, minmax(0, 1fr))` }}
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${visiblePrimary.length + (visibleSecondary.length > 0 ? 1 : 0)}, minmax(0, 1fr))` }}
        >
          {visiblePrimary.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={cn(
                  "flex h-14 min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-violet-700 dark:text-violet-400" : "text-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

          {visibleSecondary.length > 0 && (
            <button
              onClick={() => setOpen(true)}
              className={cn(
                "flex h-14 min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                open ? "text-violet-700 dark:text-violet-400" : "text-muted",
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span>More</span>
            </button>
          )}
        </div>
      </nav>

      {/* More drawer */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setOpen(false)}
          />
          {/* Sheet */}
          <div className="fixed inset-x-0 bottom-14 z-50 rounded-t-2xl border-t border-border bg-surface p-4 pb-safe md:hidden">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-text">More</span>
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-muted text-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {visibleSecondary.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl px-2 py-3 text-[11px] font-medium transition-colors",
                      active
                        ? "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                        : "text-muted hover:bg-surface-muted hover:text-text",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-center leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
