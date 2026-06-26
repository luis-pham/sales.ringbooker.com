"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MobileNav } from "@/components/layout/MobileNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import type { Profile } from "@/types";

export function DashboardShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const isSalesPage = pathname.startsWith("/sales");

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
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar role={profile.role} collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto pb-16 md:pb-0">
        <TopBar profile={profile} />
        <main className={`mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-6 ${isSalesPage ? "md:max-w-none" : ""}`}>
          {children}
        </main>
      </div>
      <MobileNav role={profile.role} />
    </div>
  );
}
