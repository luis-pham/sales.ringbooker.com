import { requireRole } from "@/lib/auth/helpers";
import { getAssignmentConfig, getPoolStats } from "@/lib/assignment/assignment-service";
import { AssignmentClient } from "./AssignmentClient";

export const metadata = { title: "Lead Assignment" };

export default async function AssignmentPage() {
  await requireRole("admin");
  const [config, stats] = await Promise.all([getAssignmentConfig(), getPoolStats()]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Lead Assignment</h1>
        <p className="text-sm text-muted">Auto-distribute leads to active reps each day.</p>
      </div>
      <AssignmentClient initialConfig={config} initialStats={stats} />
    </div>
  );
}
