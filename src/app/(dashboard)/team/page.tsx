import { TeamClient } from "./TeamClient";
import { requireRole } from "@/lib/auth/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function TeamPage() {
  await requireRole("admin");
  const adminClient = createAdminClient();
  const [{ data: profiles }, { data: invitations }] = await Promise.all([
    adminClient.from("profiles").select("id, email, role, is_active").order("created_at", { ascending: false }),
    adminClient.from("invitations").select("id, email, role, token, accepted_at").order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Team</h1>
        <p className="text-sm text-muted">Invite and manage outreach users.</p>
      </div>
      <TeamClient profiles={profiles ?? []} invitations={invitations ?? []} />
    </div>
  );
}
