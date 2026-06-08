import { google } from "googleapis";
import type { Prisma } from "@prisma/client";

import { getValidAccessToken } from "@/lib/tokens";
import type { FetchedInboxItem } from "@/lib/email/types";
import { mapWithConcurrency } from "@/lib/async/pool";
import type { SyncRange } from "@/lib/email/sync-options";

function getHeader(
  headers: { name?: string | null; value?: string | null }[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const key = name.toLowerCase();
  const h = headers.find((x) => (x.name ?? "").toLowerCase() === key);
  return h?.value ?? null;
}

/**
 * Fetches recent Gmail messages and maps them to `FetchedInboxItem`.
 */
export async function fetchGmailInbox(
  userId: string,
  maxResults: number,
  opts?: { range?: SyncRange; cursor?: string },
): Promise<{ items: FetchedInboxItem[]; nextCursor?: string }> {
  const accessToken = await getValidAccessToken(userId, "google");
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const q = opts?.range ? gmailQueryForRange(opts.range) : undefined;

  const listRes = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    labelIds: ["INBOX"],
    q,
    pageToken: opts?.cursor,
    fields: "messages(id),nextPageToken,resultSizeEstimate",
  });
  const ids = listRes.data.messages?.map((m) => m.id).filter(Boolean) as string[];
  if (!ids?.length) return { items: [], nextCursor: listRes.data.nextPageToken ?? undefined };

  const concurrency = 10;
  const items = await mapWithConcurrency(ids, concurrency, async (id) => {
    const { data: msg } = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
      metadataHeaders: ["Subject", "From"],
      fields:
        "id,threadId,internalDate,labelIds,snippet,historyId,sizeEstimate,payload(headers,body,parts,filename,mimeType,partId),raw",
    });
    if (!msg.id) return null;
    const internalDate = msg.internalDate
      ? new Date(parseInt(msg.internalDate, 10))
      : new Date();
    const headers = msg.payload?.headers ?? undefined;
    const labelIds = msg.labelIds ?? [];
    const isRead = !labelIds.includes("UNREAD");
    return {
      provider: "google" as const,
      externalId: msg.id,
      threadId: msg.threadId ?? null,
      subject: getHeader(headers, "Subject"),
      sender: getHeader(headers, "From"),
      snippet: msg.snippet ?? "",
      receivedAt: internalDate,
      isRead,
      raw: msg as unknown as Prisma.InputJsonValue,
    } satisfies FetchedInboxItem;
  });

  return {
    items: items.filter(Boolean) as FetchedInboxItem[],
    nextCursor: listRes.data.nextPageToken ?? undefined,
  };
}

export async function fetchGmailMessageRaw(
  userId: string,
  id: string,
): Promise<Prisma.InputJsonValue> {
  const accessToken = await getValidAccessToken(userId, "google");
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const { data: msg } = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "full",
    fields:
      "id,threadId,internalDate,labelIds,snippet,historyId,sizeEstimate,payload(headers,body,parts,filename,mimeType,partId),raw",
  });

  return msg as unknown as Prisma.InputJsonValue;
}

function yyyyMmDd(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function gmailQueryForRange(range: SyncRange): string {
  if (range.kind === "lastDays") {
    const now = new Date();
    const from = new Date(now.getTime() - range.days * 24 * 60 * 60 * 1000);
    return `after:${yyyyMmDd(from)}`;
  }
  // Gmail uses date-only comparisons. `before:` is exclusive; add one day for inclusive `to`.
  const from = new Date(range.from);
  const to = new Date(range.to);
  const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);
  return `after:${yyyyMmDd(from)} before:${yyyyMmDd(toExclusive)}`;
}
