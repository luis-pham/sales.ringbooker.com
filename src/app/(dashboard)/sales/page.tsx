import { requireAuth } from "@/lib/auth/helpers";
import { SalesClient } from "./SalesClient";

export const metadata = { title: "Sales CRM" };

export default async function SalesPage() {
  const profile = await requireAuth();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Sales CRM</h1>
        <p className="text-sm text-muted">Demo tracking, priority inbox, and pipeline management.</p>
      </div>
      <SalesClient role={profile.role} />
    </div>
  );
}
