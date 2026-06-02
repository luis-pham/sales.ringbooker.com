import { DashboardShell } from "@/components/layout/DashboardShell";
import { requireAuth } from "@/lib/auth/helpers";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAuth();
  return <DashboardShell profile={profile}>{children}</DashboardShell>;
}
