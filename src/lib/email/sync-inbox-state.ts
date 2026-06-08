import type { SyncInboxResult } from "@/lib/email/sync";
import type { EmailProvider } from "@/types/unified-email";
import type { SyncMode } from "@/lib/email/sync-options";

export type SyncLimitReason = "busy" | "rate";

export type SyncInboxState = SyncInboxResult & {
  at?: string;
  nextCursor?: string;
  mode?: SyncMode;
  providers?: EmailProvider[];
  /** Set when a sync is rejected by server guards (cooldown or mutex) */
  limitReason?: SyncLimitReason;
  retryAfterSec?: number;
};

export const initialSyncInboxState: SyncInboxState = {
  upserted: 0,
  errors: {},
};
