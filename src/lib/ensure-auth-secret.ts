/**
 * Fail fast in production if session signing cannot be secure.
 * Call at Auth.js / NextAuth module init (Node).
 */
export function ensureAuthSecretForProduction(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.AUTH_SECRET?.trim()) return;
  throw new Error(
    "AUTH_SECRET must be set in production. Generate a value with: openssl rand -base64 32",
  );
}
