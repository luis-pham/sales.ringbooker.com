import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { enforceMutationSecurity } from "@/lib/utils/security";
import { runAssignmentCycle } from "@/lib/assignment/assignment-service";

// Manual trigger — runs one assignment cycle immediately (admin "Run now" button).
export async function POST(request: NextRequest) {
  const security = enforceMutationSecurity(request, { key: "assignment:run", limit: 10, windowMs: 60_000 });
  if (security) return security;
  const { profile } = await getSessionUser();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await runAssignmentCycle();
  return NextResponse.json({ data: result });
}
