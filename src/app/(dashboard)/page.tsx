import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/helpers";

export default async function HomePage() {
  const profile = await requireAuth();
  redirect(profile.role === "admin" ? "/analytics" : "/sales");
}
