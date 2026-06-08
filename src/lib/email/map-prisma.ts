import type { AiStatus, Email, Prisma } from "@prisma/client";

import type { EmailProvider, UnifiedEmail } from "@/types/unified-email";

export function prismaEmailToUnified(row: Email): UnifiedEmail {
  return {
    id: row.id,
    externalId: row.externalId,
    provider: row.provider as EmailProvider,
    subject: row.subject,
    sender: row.sender,
    content: row.snippet ?? "",
    timestamp: row.receivedAt,
    isRead: row.isRead,
    aiStatus: row.aiStatus,
    vigilScore: row.vigilScore,
    category: row.category,
    summary: row.summary,
    threadId: row.threadId,
    actions: row.actions ?? null,
  };
}

/** JSON-safe `UnifiedEmail` for the inbox (`timestamp` as ISO string). */
export type InboxEmailView = {
  id: string;
  externalId: string;
  provider: EmailProvider;
  subject: string | null;
  sender: string | null;
  content: string;
  timestamp: string;
  isRead: boolean;
  aiStatus: AiStatus;
  vigilScore: number | null;
  category: string | null;
  summary: string | null;
  threadId: string | null;
  actions: Prisma.JsonValue | null;
};

export function prismaEmailToInboxView(row: Email): InboxEmailView {
  const u = prismaEmailToUnified(row);
  return {
    id: u.id!,
    externalId: u.externalId,
    provider: u.provider,
    subject: u.subject,
    sender: u.sender,
    content: u.content,
    timestamp: u.timestamp.toISOString(),
    isRead: u.isRead,
    aiStatus: row.aiStatus,
    vigilScore: u.vigilScore ?? null,
    category: u.category ?? null,
    summary: u.summary ?? null,
    threadId: row.threadId,
    actions: row.actions ?? null,
  };
}
