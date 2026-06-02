import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types";

// cache() deduplicates calls within the same request — layout + page share one DB hit
const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

const getCachedProfile = cache(async (userId: string) => {
  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<Profile>();
  return profile ?? null;
});

export async function requireAuth(): Promise<Profile> {
  const user = await getCachedUser();

  if (!user) redirect("/login");

  const profile = await getCachedProfile(user.id);

  if (!profile) redirect("/unauthorized?reason=profile");
  if (!profile.is_active) redirect("/unauthorized?reason=inactive");
  return profile;
}

export async function requireRole(role: UserRole | UserRole[]): Promise<Profile> {
  const profile = await requireAuth();
  const roles = Array.isArray(role) ? role : [role];
  if (!roles.includes(profile.role)) redirect("/");
  return profile;
}

export async function getSessionUser(): Promise<{
  user: { id: string; email: string } | null;
  profile: Profile | null;
}> {
  const user = await getCachedUser();

  if (!user?.email) return { user: null, profile: null };

  const profile = await getCachedProfile(user.id);

  return {
    user: { id: user.id, email: user.email },
    profile: profile?.is_active ? profile : null,
  };
}

export async function sendInvitation(
  email: string,
  role: Exclude<UserRole, "admin">,
  invitedBy: string,
): Promise<{ token: string } | { error: string }> {
  const adminClient = createAdminClient();
  const token = crypto.randomUUID().replaceAll("-", "");

  const { data, error } = await adminClient
    .from("invitations")
    .upsert(
      {
        email: email.toLowerCase(),
        role,
        invited_by: invitedBy,
        token,
        accepted_at: null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "email" },
    )
    .select("token")
    .single<{ token: string }>();

  if (error) return { error: error.message };
  return { token: data.token };
}

export function isAdmin(profile: Profile | null | undefined) {
  return profile?.role === "admin";
}
