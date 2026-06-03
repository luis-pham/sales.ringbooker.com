import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/helpers";
import { enforceRateLimit } from "@/lib/utils/security";
import { getPoolStats } from "@/lib/assignment/assignment-service";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { key: "assignment:pool", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const { profile } = await getSessionUser();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await getPoolStats();
  return NextResponse.json({ data });
}
