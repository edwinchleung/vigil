import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

const REFRESH_SKEW_MS = 60_000;
let accessTokenCache: { token: string; expMs: number } | null = null;

/**
 * Fetches a project-signed JWT so Supabase RLS sees auth.jwt() ->> 'sub' = NextAuth user id.
 * Cached until shortly before expiry; safe to call from the accessToken() hook (many times).
 */
async function getBrowserSupabaseAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (accessTokenCache && accessTokenCache.expMs > now + REFRESH_SKEW_MS) {
    return accessTokenCache.token;
  }
  const res = await fetch("/api/supabase-access-token", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { accessToken?: string; expiresIn?: number };
  if (typeof data.accessToken !== "string" || !data.accessToken) return null;
  const expiresIn =
    typeof data.expiresIn === "number" && data.expiresIn > 0 ? data.expiresIn : 3600;
  accessTokenCache = { token: data.accessToken, expMs: now + expiresIn * 1000 };
  return accessTokenCache.token;
}

/**
 * Single browser Supabase client (publishable/anon key + custom accessToken for RLS).
 * Returns null if Supabase env is not configured.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    client = null;
    return client;
  }
  client = createClient(url, key, {
    accessToken: getBrowserSupabaseAccessToken,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}
