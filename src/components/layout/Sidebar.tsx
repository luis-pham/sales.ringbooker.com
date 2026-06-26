"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  ScrollText,
  Scissors,
  Search,
  Settings,
  Share2,
  Target,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; roles: UserRole[] };

// Top-level: everyone's day-to-day work.
const MAIN_ITEMS: NavItem[] = [
  { href: "/analytics", label: "Tổng quan", icon: BarChart3, roles: ["admin"] },
  { href: "/sales", label: "CRM bán hàng", icon: Target, roles: ["admin", "outreacher", "viewer"] },
  { href: "/leads", label: "Lead", icon: Scissors, roles: ["admin", "outreacher", "viewer"] },
  { href: "/demos", label: "Demo", icon: Bot, roles: ["admin", "outreacher"] },
];

// Grouped under "Settings": configure-once / monitor (admin).
const SETTINGS_ITEMS: NavItem[] = [
  { href: "/assignment", label: "Giao việc", icon: Share2, roles: ["admin"] },
  { href: "/search", label: "Tìm kiếm", icon: Search, roles: ["admin"] },
  { href: "/team", label: "Đội ngũ", icon: Users, roles: ["admin"] },
  { href: "/jobs", label: "Tiến trình", icon: BrainCircuit, roles: ["admin"] },
  { href: "/logs", label: "Log API", icon: ScrollText, roles: ["admin"] },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

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
  const mainVisible = MAIN_ITEMS.filter((item) => item.roles.includes(role));
  const settingsVisible = SETTINGS_ITEMS.filter((item) => item.roles.includes(role));
  const settingsActive = settingsVisible.some((item) => isActive(pathname, item.href));
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);

  const linkClass = (active: boolean) =>
    cn(
      "flex h-10 items-center rounded-md text-sm font-medium transition-colors",
      collapsed ? "justify-center px-0" : "gap-3 px-3",
      active
        ? "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
        : "text-muted hover:bg-surface-muted hover:text-text",
    );

  function navLink(item: NavItem, indent = false) {
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={false}
        title={collapsed ? item.label : undefined}
        className={cn(linkClass(isActive(pathname, item.href)), indent && !collapsed && "pl-9")}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && item.label}
      </Link>
    );
  }

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
            <div className="text-xs text-muted">Dữ liệu Lead</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {mainVisible.map((item) => navLink(item))}

        {settingsVisible.length > 0 && (
          collapsed ? (
            <>
              <div className="my-1 border-t border-border" />
              {settingsVisible.map((item) => navLink(item))}
            </>
          ) : (
            <>
              <button
                onClick={() => setSettingsOpen((o) => !o)}
                className={cn(linkClass(settingsActive && !settingsOpen), "w-full justify-between")}
              >
                <span className="flex items-center gap-3">
                  <Settings className="h-4 w-4 shrink-0" />
                  Cài đặt
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", settingsOpen ? "" : "-rotate-90")} />
              </button>
              {settingsOpen && (
                <div className="space-y-1">
                  {settingsVisible.map((item) => navLink(item, true))}
                </div>
              )}
            </>
          )
        )}
      </nav>

      <div className="shrink-0 border-t border-border p-2">
        <button
          onClick={onToggle}
          title={collapsed ? "Mở rộng" : "Thu gọn"}
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
              <span>Thu gọn</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
