import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const redirect = searchParams.get("redirect") ?? "/";

  if (error) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(exchangeError.message)}`);
    }

    const safePath = redirect.startsWith("/") ? redirect : "/";
    return NextResponse.redirect(`${origin}${safePath}`);
  }

  return NextResponse.redirect(`${origin}/login`);
}
