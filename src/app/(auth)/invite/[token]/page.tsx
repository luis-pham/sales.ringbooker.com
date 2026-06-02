import { notFound, redirect } from "next/navigation";
import { AcceptInviteClient } from "./AcceptInviteClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: invitation } = await adminClient
    .from("invitations")
    .select("*")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .single<{ id: string; email: string; role: string }>();

  if (!invitation) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email?.toLowerCase() === invitation.email.toLowerCase()) {
    await adminClient.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id);
    await adminClient.from("profiles").update({ role: invitation.role }).eq("id", user.id);
    redirect("/");
  }

  return <AcceptInviteClient email={invitation.email} token={token} />;
}
