import type { EmailProvider } from "@/types/unified-email";
import type { Prisma } from "@prisma/client";

/** One message ready to upsert into `Email` (wire-agnostic). */
export type FetchedInboxItem = {
  provider: EmailProvider;
  externalId: string;
  /// Gmail threadId or Microsoft Graph conversationId
  threadId: string | null;
  subject: string | null;
  sender: string | null;
  snippet: string;
  receivedAt: Date;
  isRead: boolean;
  raw: Prisma.InputJsonValue;
};
