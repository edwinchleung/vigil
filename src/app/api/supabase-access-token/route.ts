import { auth } from "@/auth";
import { createRateLimiter } from "@/lib/rate-limit-memory";
import {
  signSupabaseUserAccessToken,
  supabaseUserAccessTtlSeconds,
} from "@/lib/supabase/sign-access-token";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const limitAuthenticated = createRateLimiter(30);
const limitUnauthenticatedIp = createRateLimiter(60);

function clientIpFromHeaders(h: Headers): string {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0];
    if (first?.trim()) return first.trim();
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}

function noStoreJson(
  body: Record<string, unknown>,
  init: { status?: number; extraHeaders?: Record<string, string> } = {},
) {
  const { status = 200, extraHeaders = {} } = init;
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      ...extraHeaders,
    },
  });
}

/**
 * Mints a short-lived JWT for Supabase (RLS/Realtime) with `sub` = NextAuth user id.
 * POST only. Requires the project JWT secret on the server (not exposed to the client).
 */
export async function POST() {
  const h = await headers();
  const ip = clientIpFromHeaders(h);

  const session = await auth();
  if (!session?.user?.id) {
    const ipKey = `supabase-token:unauth:${ip}`;
    const limited = limitUnauthenticatedIp(ipKey);
    if (!limited.ok) {
      return noStoreJson(
        { error: "Too many requests" },
        {
          status: 429,
          extraHeaders: { "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }

  const rateKey = `supabase-token:${session.user.id}:${ip}`;
  const limited = limitAuthenticated(rateKey);
  if (!limited.ok) {
    return noStoreJson(
      { error: "Too many requests" },
      {
        status: 429,
        extraHeaders: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  try {
    const accessToken = await signSupabaseUserAccessToken(session.user.id);
    return noStoreJson({
      accessToken,
      expiresIn: supabaseUserAccessTtlSeconds(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Token error";
    if (message.includes("not set")) {
      return noStoreJson(
        { error: "Supabase token signing is not configured" },
        { status: 503 },
      );
    }
    return noStoreJson({ error: "Failed to sign token" }, { status: 500 });
  }
}

/** GET removed: use POST to avoid caching / prefetch of credential-like responses. */
export function GET() {
  return noStoreJson(
    { error: "Method not allowed. Use POST." },
    { status: 405, extraHeaders: { Allow: "POST" } },
  );
}
