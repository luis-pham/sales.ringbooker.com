import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/invite", "/unauthorized"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) return NextResponse.next({ request });
  if (pathname.startsWith("/api/webhooks/")) return NextResponse.next({ request });
  if (pathname.startsWith("/api/jobs/worker")) return NextResponse.next({ request });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "ringbooker.com")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  const emailDomain = user.email?.split("@")[1]?.toLowerCase() ?? "";

  if (allowedDomains.length > 0 && !allowedDomains.includes(emailDomain)) {
    const { data: invite } = await supabase
      .from("invitations")
      .select("id")
      .eq("email", user.email)
      .not("accepted_at", "is", null)
      .maybeSingle();

    if (!invite) return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  const adminPaths = ["/team", "/analytics", "/search"];
  if (adminPaths.some((path) => pathname.startsWith(path)) && profile.role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
