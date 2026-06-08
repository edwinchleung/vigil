import { SignJWT } from "jose";

const TTL_SECONDS = 3600;

/**
 * Supabase HS256 user token for RLS/Realtime. `sub` must match Email.userId (NextAuth user id).
 * Uses the project JWT secret from Supabase (Settings -> API; legacy "JWT secret").
 */
export function supabaseUserAccessTtlSeconds(): number {
  return TTL_SECONDS;
}

function jwtIssuerFromProjectUrl(supabaseUrl: string): string {
  const base = supabaseUrl.endsWith("/") ? supabaseUrl : `${supabaseUrl}/`;
  return new URL("auth/v1", base).toString();
}

export async function signSupabaseUserAccessToken(userId: string): Promise<string> {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawSecret = process.env.SUPABASE_JWT_SECRET;
  if (!projectUrl?.trim()) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  if (!rawSecret?.trim()) {
    throw new Error("SUPABASE_JWT_SECRET is not set");
  }
  const key = new TextEncoder().encode(rawSecret);
  const iss = jwtIssuerFromProjectUrl(projectUrl.trim());

  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .setIssuer(iss)
    .setAudience("authenticated")
    .sign(key);
}
