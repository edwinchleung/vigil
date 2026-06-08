import { AiStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EmailProvider } from "@/types/unified-email";
import type { FetchedInboxItem } from "@/lib/email/types";
import type { SyncInboxOptions } from "@/lib/email/sync-options";

import { contentMeaningfullyChanged } from "@/lib/email/content-changed";
import { mapWithConcurrency } from "@/lib/async/pool";
import { fetchGmailInbox, fetchGmailMessageRaw } from "@/lib/email/gmail";
import {
  fetchMicrosoftInbox,
  fetchMicrosoftMessageRaw,
} from "@/lib/email/microsoft-graph";
import {
  logSyncProviderError,
  userSafeSyncErrorMessage,
} from "@/lib/email/sync-user-messages";

/** Max messages fetched per provider per sync (avoids long serverless runs). */
export const MAX_SYNC_MESSAGES_PER_PROVIDER = 40;
const UPSERT_CONCURRENCY = 10;

export type SyncInboxResult = {
  upserted: number;
  errors: Partial<Record<EmailProvider, string>>;
  nextCursor?: string;
};

async function upsertInboxItems(userId: string, items: FetchedInboxItem[]) {
  if (items.length === 0) return 0;

  const provider = items[0].provider;
  const externalIds = items.map((i) => i.externalId);

  const existingRows = await prisma.email.findMany({
    where: { userId, provider, externalId: { in: externalIds } },
    select: { externalId: true, subject: true, sender: true, snippet: true, threadId: true },
  });
  const existingByExternalId = new Map(
    existingRows.map((r) => [r.externalId, r] as const),
  );

  await mapWithConcurrency(items, UPSERT_CONCURRENCY, async (item) => {
    const existing = existingByExternalId.get(item.externalId) ?? null;
    const shouldResetAi =
      existing != null && contentMeaningfullyChanged(existing, item);

    const baseFields = {
      subject: item.subject,
      sender: item.sender,
      snippet: item.snippet,
      threadId: item.threadId,
      receivedAt: item.receivedAt,
      isRead: item.isRead,
      raw: item.raw,
    };

    await prisma.email.upsert({
      where: {
        provider_externalId_userId: {
          provider: item.provider,
          externalId: item.externalId,
          userId,
        },
      },
      create: {
        userId,
        provider: item.provider,
        externalId: item.externalId,
        ...baseFields,
        aiStatus: AiStatus.PENDING,
      },
      update: shouldResetAi
        ? {
            ...baseFields,
            aiStatus: AiStatus.PENDING,
            vigilScore: null,
            category: null,
            summary: null,
            actions: Prisma.DbNull,
          }
        : baseFields,
    });
  });

  return items.length;
}

type ProviderCursor = Partial<Record<EmailProvider, string>>;

function parseCursor(raw: string | undefined): ProviderCursor {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object") return v as ProviderCursor;
    return {};
  } catch {
    return {};
  }
}

function serializeCursor(c: ProviderCursor): string | undefined {
  const keys = Object.keys(c);
  if (keys.length === 0) return undefined;
  return JSON.stringify(c);
}

export async function syncInboxForUser(
  userId: string,
  options: SyncInboxOptions,
): Promise<SyncInboxResult> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { provider: true },
  });
  const linked = new Set(accounts.map((a) => a.provider));
  const selected = new Set(options.providers);
  const cursorByProvider = parseCursor(options.batch.cursor);

  const errors: SyncInboxResult["errors"] = {};
  let upserted = 0;
  const nextCursorByProvider: ProviderCursor = {};

  const totalStart = Date.now();

  if (options.mode === "backfillMissingRaw") {
    const result = await backfillMissingRaw({
      userId,
      selected,
      cursorByProvider,
      range: options.range,
      limit: options.batch.limit,
    });
    console.info(
      `[syncInbox] mode=backfillMissingRaw total_ms=${Date.now() - totalStart} upserted=${result.upserted} next=${result.nextCursor ? "1" : "0"}`,
    );
    return result;
  }

  const tasks: Promise<
    { provider: EmailProvider; upserted: number } | { provider: EmailProvider; error: unknown }
  >[] = [];

  if (linked.has("google") && selected.has("google")) {
    tasks.push(
      (async () => {
        try {
          const fetchStart = Date.now();
          const page = await fetchGmailInbox(userId, options.batch.limit, {
            range: options.range,
            cursor: cursorByProvider.google,
          });
          const fetchMs = Date.now() - fetchStart;

          const upsertStart = Date.now();
          const count = await upsertInboxItems(userId, page.items);
          const upsertMs = Date.now() - upsertStart;

          if (page.nextCursor) nextCursorByProvider.google = page.nextCursor;

          console.info(
            `[syncInbox] provider=google items=${page.items.length} fetch_ms=${fetchMs} upsert_ms=${upsertMs}`,
          );
          return { provider: "google" as const, upserted: count };
        } catch (e) {
          return { provider: "google" as const, error: e };
        }
      })(),
    );
  }

  if (linked.has("microsoft-entra-id") && selected.has("microsoft-entra-id")) {
    tasks.push(
      (async () => {
        try {
          const fetchStart = Date.now();
          const page = await fetchMicrosoftInbox(userId, options.batch.limit, {
            range: options.range,
            cursor: cursorByProvider["microsoft-entra-id"],
          });
          const fetchMs = Date.now() - fetchStart;

          const upsertStart = Date.now();
          const count = await upsertInboxItems(userId, page.items);
          const upsertMs = Date.now() - upsertStart;

          if (page.nextCursor) {
            nextCursorByProvider["microsoft-entra-id"] = page.nextCursor;
          }

          console.info(
            `[syncInbox] provider=microsoft-entra-id items=${page.items.length} fetch_ms=${fetchMs} upsert_ms=${upsertMs}`,
          );
          return { provider: "microsoft-entra-id" as const, upserted: count };
        } catch (e) {
          return { provider: "microsoft-entra-id" as const, error: e };
        }
      })(),
    );
  }

  const results = await Promise.all(tasks);
  for (const r of results) {
    if ("error" in r) {
      logSyncProviderError(r.provider, r.error);
      errors[r.provider] = userSafeSyncErrorMessage(r.provider);
    } else {
      upserted += r.upserted;
    }
  }

  const nextCursor = serializeCursor(nextCursorByProvider);
  console.info(
    `[syncInbox] total_ms=${Date.now() - totalStart} upserted=${upserted} next=${nextCursor ? "1" : "0"}`,
  );
  return { upserted, errors, nextCursor };
}

function rangeToDates(range: SyncInboxOptions["range"]): { from?: Date; to?: Date } {
  if (range.kind === "lastDays") {
    const now = new Date();
    const from = new Date(now.getTime() - range.days * 24 * 60 * 60 * 1000);
    return { from };
  }
  const from = range.from ? new Date(range.from) : undefined;
  const to = range.to ? new Date(range.to) : undefined;
  return { from, to };
}

async function backfillMissingRaw(args: {
  userId: string;
  selected: Set<EmailProvider>;
  cursorByProvider: ProviderCursor;
  range: SyncInboxOptions["range"];
  limit: number;
}): Promise<SyncInboxResult> {
  const errors: SyncInboxResult["errors"] = {};
  let upserted = 0;
  const nextCursorByProvider: ProviderCursor = {};

  const { from, to } = rangeToDates(args.range);

  const providers: EmailProvider[] = [];
  if (args.selected.has("google")) providers.push("google");
  if (args.selected.has("microsoft-entra-id")) providers.push("microsoft-entra-id");

  for (const provider of providers) {
    try {
      const cursor = args.cursorByProvider[provider];
      const after =
        cursor && cursor.startsWith("db:")
          ? parseDbCursor(cursor.slice(3))
          : undefined;

      const where: Prisma.EmailWhereInput = {
        userId: args.userId,
        provider,
        raw: { equals: Prisma.DbNull },
        ...(from || to
          ? {
              receivedAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
        ...(after
          ? {
              OR: [
                { receivedAt: { lt: after.receivedAt } },
                {
                  receivedAt: after.receivedAt,
                  id: { lt: after.id },
                },
              ],
            }
          : {}),
      };

      const rows = await prisma.email.findMany({
        where,
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        take: args.limit,
        select: { id: true, externalId: true, receivedAt: true },
      });

      if (rows.length === 0) continue;

      await mapWithConcurrency(rows, UPSERT_CONCURRENCY, async (row) => {
        const raw =
          provider === "google"
            ? await fetchGmailMessageRaw(args.userId, row.externalId)
            : await fetchMicrosoftMessageRaw(args.userId, row.externalId);
        await prisma.email.update({
          where: { id: row.id },
          data: { raw },
        });
      });

      upserted += rows.length;

      if (rows.length === args.limit) {
        const last = rows[rows.length - 1];
        nextCursorByProvider[provider] = `db:${last.receivedAt.toISOString()}|${last.id}`;
      }
    } catch (e) {
      logSyncProviderError(provider, e);
      errors[provider] = userSafeSyncErrorMessage(provider);
    }
  }

  return { upserted, errors, nextCursor: serializeCursor(nextCursorByProvider) };
}

function parseDbCursor(v: string): { receivedAt: Date; id: string } | undefined {
  const [iso, id] = v.split("|");
  if (!iso || !id) return undefined;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return undefined;
  return { receivedAt: d, id };
}
