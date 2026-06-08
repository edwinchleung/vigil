import { PrismaClient } from "@prisma/client";

/**
 * Supabase transaction pooler (port 6543) sits behind PgBouncer. Prisma uses
 * prepared statements by default; without `pgbouncer=true` Postgres can report
 * `prepared statement "s0" already exists` (42P05) when statements are
 * re-prepared on the same pooled connection. See Prisma "Configure for
 * PgBouncer" and Supabase + Prisma docs.
 */
function databaseUrlForRuntime(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.port === "6543" && u.searchParams.get("pgbouncer") !== "true") {
      u.searchParams.set("pgbouncer", "true");
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[prisma] Set pgbouncer=true on DATABASE_URL (port 6543 is the transaction pooler). Add ?pgbouncer=true in .env.local to make this explicit."
        );
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    datasources: {
      db: { url: databaseUrlForRuntime(process.env.DATABASE_URL) },
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const cached = globalForPrisma.prisma;
/**
 * In dev, `next dev` can reuse a `PrismaClient` from before a new model existed.
 * Old generated classes have no `intent` on the prototype, so the delegate is missing.
 * `new` after `prisma generate` without restarting dev can also leave a stale *class* in
 * the module cache; then you must fully restart the dev process.
 */
const needsRefreshDevDelegate =
  process.env.NODE_ENV !== "production" &&
  cached != null &&
  !("intent" in (cached as object));

const resolved = (() => {
  if (needsRefreshDevDelegate) {
    void (cached as PrismaClient).$disconnect().catch(() => {});
    const p = createPrismaClient();
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = p;
    }
    return p;
  }
  const p = cached ?? createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = p;
  }
  return p;
})();

export const prisma = resolved;

if (process.env.NODE_ENV === "development" && !("intent" in (prisma as object))) {
  console.error(
    "[prisma] PrismaClient is missing the `intent` model delegate. This usually means the dev server (or @prisma/client) was built before the current schema. Run `bunx prisma generate`, then **fully stop and restart** `bun run dev` so a fresh PrismaClient is imported.",
  );
}
