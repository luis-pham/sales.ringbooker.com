"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export function AcceptInviteClient({
  email,
  token,
}: {
  email: string;
  token: string;
}) {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(`/invite/${token}`)}`,
      },
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          <div>
            <h1 className="text-xl font-semibold text-text">Accept your RingBooker Sales invite</h1>
            <p className="mt-1 text-sm text-muted">Sign in as {email} to join the workspace.</p>
          </div>
          <Button onClick={signIn} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
