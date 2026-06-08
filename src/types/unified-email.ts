import type { AiStatus, Prisma } from "@prisma/client";

/**
 * Unified in-app view of a message (Gmail + Microsoft Graph), independent of
 * provider wire format. `content` is **preview** text in Milestone 2; full
 * bodies can be added in a later milestone.
 */
export type EmailProvider = "google" | "microsoft-entra-id";

export type UnifiedEmail = {
  /** Prisma `Email.id` when loaded from DB; not set when mapping from an API only. */
  id?: string;
  /** Provider message id (Gmail / Graph) — stable per mailbox. */
  externalId: string;
  provider: EmailProvider;
  subject: string | null;
  sender: string | null;
  content: string;
  timestamp: Date;
  isRead: boolean;
  /** Present when the row is loaded from Prisma (Milestone 3+). */
  aiStatus?: AiStatus;
  vigilScore?: number | null;
  category?: string | null;
  summary?: string | null;
  threadId?: string | null;
  actions?: Prisma.JsonValue | null;
};
