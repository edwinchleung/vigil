import { Client } from "@microsoft/microsoft-graph-client";
import type { Prisma } from "@prisma/client";

import { getValidAccessToken } from "@/lib/tokens";
import type { FetchedInboxItem } from "@/lib/email/types";
import type { SyncRange } from "@/lib/email/sync-options";

type GraphMessage = {
  id: string;
  conversationId?: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  bodyPreview?: string;
  body?: { contentType?: "html" | "text"; content?: string };
  isRead?: boolean;
  receivedDateTime?: string;
};

function buildGraphClient(userId: string) {
  return Client.init({
    authProvider: (done) => {
      getValidAccessToken(userId, "microsoft-entra-id")
        .then((t) => done(null, t))
        .catch((e) => done(e, null));
    },
  });
}

/**
 * Fetches recent Outlook / Exchange messages via Microsoft Graph.
 */
export async function fetchMicrosoftInbox(
  userId: string,
  top: number,
  opts?: { range?: SyncRange; cursor?: string },
): Promise<{ items: FetchedInboxItem[]; nextCursor?: string }> {
  const client = buildGraphClient(userId);

  const api = opts?.cursor
    ? client.api(opts.cursor)
    : client.api("/me/mailFolders/inbox/messages");

  if (!opts?.cursor) {
    api.top(top).orderby("receivedDateTime DESC");
    if (opts?.range) api.filter(graphFilterForRange(opts.range));
  }

  const res = (await api
    .select("id,conversationId,subject,from,bodyPreview,body,isRead,receivedDateTime")
    .get()) as { value?: GraphMessage[]; "@odata.nextLink"?: string };

  const values = res.value ?? [];
  const out: FetchedInboxItem[] = [];
  for (const m of values) {
    if (!m.id) continue;
    const from = m.from?.emailAddress;
    const senderLine =
      from?.name && from?.address
        ? `${from.name} <${from.address}>`
        : from?.address ?? from?.name ?? null;

    out.push({
      provider: "microsoft-entra-id",
      externalId: m.id,
      threadId: m.conversationId ?? null,
      subject: m.subject ?? null,
      sender: senderLine,
      snippet: m.bodyPreview ?? "",
      receivedAt: m.receivedDateTime
        ? new Date(m.receivedDateTime)
        : new Date(),
      isRead: m.isRead ?? true,
      raw: m as unknown as Prisma.InputJsonValue,
    });
  }
  return { items: out, nextCursor: res["@odata.nextLink"] ?? undefined };
}

export async function fetchMicrosoftMessageRaw(
  userId: string,
  id: string,
): Promise<Prisma.InputJsonValue> {
  const client = buildGraphClient(userId);
  const msg = (await client
    .api(`/me/messages/${id}`)
    .select("id,conversationId,subject,from,bodyPreview,body,isRead,receivedDateTime")
    .get()) as GraphMessage;
  return msg as unknown as Prisma.InputJsonValue;
}

function graphFilterForRange(range: SyncRange): string {
  if (range.kind === "lastDays") {
    const now = new Date();
    const from = new Date(now.getTime() - range.days * 24 * 60 * 60 * 1000);
    return `receivedDateTime ge ${from.toISOString()}`;
  }
  const from = new Date(range.from);
  const to = new Date(range.to);
  return `receivedDateTime ge ${from.toISOString()} and receivedDateTime le ${to.toISOString()}`;
}
