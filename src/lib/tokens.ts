import { prisma } from "@/lib/prisma";

export type Provider = "google" | "microsoft-entra-id";

/**
 * Refresh an OAuth access token using a stored refresh_token and update
 * the `Account` row in place. Centralised so the Milestone 2 Gmail / Graph
 * fetchers only need to call `getValidAccessToken()`.
 *
 * Consult the provider's own docs for exact endpoint behaviour:
 * - Google:    https://developers.google.com/identity/protocols/oauth2/web-server#offline
 * - Microsoft: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
 */

type RefreshResult = {
  access_token: string;
  expires_at: number;
  refresh_token?: string;
};

async function refreshGoogleToken(refreshToken: string): Promise<RefreshResult> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token || !json.expires_in) {
    throw new Error(
      `Google token refresh failed: ${json.error ?? res.statusText} - ${json.error_description ?? ""}`,
    );
  }
  return {
    access_token: json.access_token,
    expires_at: Math.floor(Date.now() / 1000) + json.expires_in,
    refresh_token: json.refresh_token,
  };
}

/** Map OIDC issuer (…/v2.0) to the OAuth2 token endpoint (…/oauth2/v2.0/token). */
function microsoftOAuth2TokenEndpoint(issuer: string): string {
  const normalized = issuer.replace(/\/$/, "");
  // Issuer is like https://login.microsoftonline.com/common/v2.0 — not …/v2.0/token
  const withoutV2 = normalized.replace(/\/v2\.0$/i, "");
  return `${withoutV2}/oauth2/v2.0/token`;
}

async function refreshMicrosoftToken(
  refreshToken: string,
): Promise<RefreshResult> {
  const issuer =
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ??
    "https://login.microsoftonline.com/common/v2.0";
  const tokenUrl = microsoftOAuth2TokenEndpoint(issuer);
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "openid email profile offline_access User.Read Mail.Read",
    }),
  });
  const raw = await res.text();
  if (!raw.trim()) {
    throw new Error(
      `Microsoft token refresh failed: empty response body (HTTP ${res.status} ${res.statusText})`,
    );
  }
  let json: {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  try {
    json = JSON.parse(raw) as typeof json;
  } catch {
    throw new Error(
      `Microsoft token refresh failed: response was not valid JSON (HTTP ${res.status}, body length ${raw.length})`,
    );
  }
  if (!res.ok || !json.access_token || !json.expires_in) {
    throw new Error(
      `Microsoft token refresh failed: ${json.error ?? res.statusText} - ${json.error_description ?? ""}`,
    );
  }
  return {
    access_token: json.access_token,
    expires_at: Math.floor(Date.now() / 1000) + json.expires_in,
    refresh_token: json.refresh_token,
  };
}

/**
 * Returns a non-expired access token for the given user + provider.
 * Refreshes it (and updates the Account row) if it has expired or is
 * within the 60-second skew window.
 */
export async function getValidAccessToken(
  userId: string,
  provider: Provider,
): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider },
  });
  if (!account) throw new Error(`No ${provider} account linked for user ${userId}`);
  if (!account.access_token) throw new Error(`Account ${account.id} has no access_token`);

  const now = Math.floor(Date.now() / 1000);
  const skew = 60;
  const expiresAt = account.expires_at ?? 0;
  if (expiresAt - skew > now) return account.access_token;

  if (!account.refresh_token) {
    throw new Error(
      `Account ${account.id} is expired and has no refresh_token; user must re-authenticate`,
    );
  }

  const refreshed =
    provider === "google"
      ? await refreshGoogleToken(account.refresh_token)
      : await refreshMicrosoftToken(account.refresh_token);

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: refreshed.access_token,
      expires_at: refreshed.expires_at,
      refresh_token: refreshed.refresh_token ?? account.refresh_token,
    },
  });

  return refreshed.access_token;
}
