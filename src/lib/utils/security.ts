import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

export function verifyInternalRequest(request: NextRequest) {
  const provided = request.headers.get("x-internal-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return safeCompareAny(provided, [env.internalApiSecret, env.cronSecret]);
}

export function verifySharedSecret(provided: string | null | undefined, expected: string | null | undefined) {
  return safeCompareAny(provided ?? null, [expected ?? ""]);
}

export function enforceSameOrigin(request: NextRequest) {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;

  const origin = request.headers.get("origin");
  if (!origin) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Missing origin" }, { status: 403 });
    }
    return null;
  }

  const expectedOrigin = request.nextUrl.origin;
  if (origin !== expectedOrigin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  return null;
}

type RateLimitPolicy = {
  key: string;
  limit: number;
  windowMs: number;
  identifier?: string;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const globalRateLimit = globalThis as typeof globalThis & {
  __salesRingbookerRateLimit?: Map<string, RateLimitBucket>;
};

function getRateLimitStore() {
  globalRateLimit.__salesRingbookerRateLimit ??= new Map<string, RateLimitBucket>();
  return globalRateLimit.__salesRingbookerRateLimit;
}

export function enforceRateLimit(request: NextRequest, policy: RateLimitPolicy) {
  const store = getRateLimitStore();
  const now = Date.now();
  const subject = policy.identifier ?? getClientIp(request);
  const key = `${policy.key}:${subject}`;
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + policy.windowMs });
    cleanupRateLimitStore(store, now);
    return null;
  }

  if (bucket.count >= policy.limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSeconds: retryAfter },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  bucket.count += 1;
  return null;
}

export function enforceMutationSecurity(request: NextRequest, policy: RateLimitPolicy) {
  return enforceSameOrigin(request) ?? enforceRateLimit(request, policy);
}

export function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function safeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function safeCompareAny(provided: string | null | undefined, expectedValues: string[]) {
  if (!provided) return false;
  return expectedValues.some((expected) => safeCompare(provided, expected));
}

function safeCompare(provided: string, expected: string | null | undefined) {
  if (!expected) return false;
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

function cleanupRateLimitStore(store: Map<string, RateLimitBucket>, now: number) {
  if (store.size < 1000) return;
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}
