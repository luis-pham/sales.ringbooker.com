import { MobileNav } from "@/components/layout/MobileNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { requireAuth } from "@/lib/auth/helpers";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAuth();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar role={profile.role} />
      <div className="min-w-0 flex-1 pb-16 md:pb-0">
        <TopBar profile={profile} />
        <main className="mx-auto w-full max-w-7xl px-4 py-5 md:px-6">{children}</main>
      </div>
      <MobileNav role={profile.role} />
    </div>
  );
}
