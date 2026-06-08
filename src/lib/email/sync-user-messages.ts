import type { EmailProvider } from "@/types/unified-email";

const BY_PROVIDER: Record<EmailProvider, string> = {
  google:
    "Gmail could not be reached. Try again or reconnect your account from the dashboard.",
  "microsoft-entra-id":
    "Outlook could not be reached. Try again or reconnect your account from the dashboard.",
};

export function userSafeSyncErrorMessage(provider: EmailProvider): string {
  return BY_PROVIDER[provider];
}

export function logSyncProviderError(provider: EmailProvider, err: unknown): void {
  console.error(`[syncInbox] provider=${provider}`, err);
}
