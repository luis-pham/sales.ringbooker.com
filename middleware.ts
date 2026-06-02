import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/invite", "/unauthorized"];

function parseAllowedDomains(value: string | undefined) {
  const domains = (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => (entry.includes("@") ? entry.split("@").pop() ?? "" : entry))
    .filter(Boolean);

  return domains.length > 0 ? domains : ["ringbooker.com"];
}

function redirectUnauthorized(request: NextRequest, reason: "domain") {
  const url = new URL("/unauthorized", request.url);
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

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

  const allowedDomains = parseAllowedDomains(process.env.ALLOWED_EMAIL_DOMAINS);
  const emailDomain = user.email?.split("@")[1]?.toLowerCase() ?? "";

  if (allowedDomains.length > 0 && !allowedDomains.includes(emailDomain)) {
    const { data: invite } = await supabase
      .from("invitations")
      .select("id")
      .eq("email", user.email)
      .not("accepted_at", "is", null)
      .maybeSingle();

    if (!invite) return redirectUnauthorized(request, "domain");
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
