import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

/**
 * Edge-safe Auth.js configuration.
 *
 * Imported by `proxy.ts` (Next.js 16) and by `auth.ts`. The proxy cannot use
 * the Prisma adapter; `auth.ts` extends this with the adapter and Node-only
 * callbacks.
 *
 * Scopes requested here are what unlock Gmail / Microsoft Graph access
 * later (Milestone 2). `offline_access` / `access_type=offline` ensure we
 * receive a `refresh_token` that can be used by `src/lib/tokens.ts` to
 * mint fresh access tokens on demand.
 */
export default {
  trustHost:
    process.env.NODE_ENV !== "production" ||
    process.env.VERCEL === "1" ||
    process.env.AUTH_TRUST_HOST === "true",
  providers: [
    Google({
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    MicrosoftEntraID({
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      authorization: {
        params: {
          scope: "openid email profile offline_access User.Read Mail.Read",
        },
      },
    }),
  ],
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = request.nextUrl.pathname.startsWith("/dashboard");
      if (isOnDashboard) return isLoggedIn;
      return true;
    },
  },
} satisfies NextAuthConfig;
