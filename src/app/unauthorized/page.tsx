import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

const REASON_COPY: Record<string, string> = {
  domain: "Your email domain is not on the workspace allowlist and no accepted invitation was found.",
  profile: "Your sign-in succeeded, but this account does not have an active workspace profile yet.",
  inactive: "This workspace profile is currently inactive.",
};

type UnauthorizedPageProps = {
  searchParams?: Promise<{ reason?: string }> | { reason?: string };
};

export default async function UnauthorizedPage({ searchParams }: UnauthorizedPageProps) {
  const params = await searchParams;
  const message =
    params?.reason && REASON_COPY[params.reason]
      ? REASON_COPY[params.reason]
      : "This workspace is restricted to RingBooker team members or invited outreach users.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          <div>
            <h1 className="text-xl font-semibold text-text">Access not authorized</h1>
            <p className="mt-1 text-sm text-muted">{message}</p>
          </div>
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-text hover:bg-surface-muted"
          >
            Back to login
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
