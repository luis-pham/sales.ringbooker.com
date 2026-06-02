"use client";

import { useEffect, useState } from "react";
import { MobileNav } from "@/components/layout/MobileNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import type { Profile } from "@/types";

export function DashboardShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "true");
  }, []);

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar role={profile.role} collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="min-w-0 flex-1 pb-16 md:pb-0">
        <TopBar profile={profile} />
        <main className="mx-auto w-full max-w-7xl px-4 py-5 md:px-6">{children}</main>
      </div>
      <MobileNav role={profile.role} />
    </div>
  );
}
