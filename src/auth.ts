import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";

import authConfig from "@/auth.config";
import { ensureAuthSecretForProduction } from "@/lib/ensure-auth-secret";
import { prisma } from "@/lib/prisma";

ensureAuthSecretForProduction();

if (process.env.NODE_ENV !== "production" && !process.env.AUTH_SECRET) {
  console.warn(
    "[auth] AUTH_SECRET is unset. After a dev server restart, old session cookies can cause JWTSessionError / Invalid Compact JWE. Set AUTH_SECRET in .env.local (openssl rand -base64 32) and clear site data for localhost if sign-in still fails."
  );
}

/**
 * Main Auth.js v5 instance.
 *
 * Uses database sessions (required so that `refresh_token` and `expires_at`
 * are persisted on the `Account` row and can later be consumed by
 * `src/lib/tokens.ts`).
 *
 * The edge-safe provider config lives in `auth.config.ts`; this file
 * extends it with the Prisma adapter and Node-only callbacks.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
