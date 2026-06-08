import { prisma } from "@/lib/prisma";
import { retryAfterFromLastSync, retryAfterFromLock } from "@/lib/email/retry-after";

/**
 * Per-user sync cooldown and mutex via `User.lastSyncAt` + `User.syncLockUntil`.
 * Session `pg_advisory_lock` is avoided: Prisma’s pool hands out different session
 * connections, so a row-based lease is a reliable cross-instance mutex.
 */

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getSyncGuardsConfig() {
  return {
    minIntervalSec: Math.max(1, parseIntEnv("SYNC_MIN_INTERVAL_SEC", 60)),
    lockTtlSec: Math.max(30, parseIntEnv("SYNC_LOCK_TTL_SEC", 600)),
    lockBusyRetrySec: Math.max(1, parseIntEnv("SYNC_LOCK_BUSY_RETRY_SEC", 10)),
  };
}

export { retryAfterFromLastSync, retryAfterFromLock } from "@/lib/email/retry-after";

export type AcquireLockResult = { ok: true } | { ok: false; retryAfterSec: number };

export async function tryAcquireUserSyncLock(userId: string): Promise<AcquireLockResult> {
  const { lockTtlSec, lockBusyRetrySec } = getSyncGuardsConfig();
  const now = new Date();
  const until = new Date(now.getTime() + lockTtlSec * 1000);

  const r = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ syncLockUntil: null }, { syncLockUntil: { lt: now } }],
    },
    data: { syncLockUntil: until },
  });

  if (r.count > 0) return { ok: true };

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { syncLockUntil: true },
  });
  if (row?.syncLockUntil && row.syncLockUntil > now) {
    return { ok: false, retryAfterSec: retryAfterFromLock(row.syncLockUntil, now) };
  }
  return { ok: false, retryAfterSec: lockBusyRetrySec };
}

export async function releaseUserSyncLock(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { syncLockUntil: null },
    });
  } catch {
    // best-effort
  }
}

export type RateSlotResult = { ok: true } | { ok: false; retryAfterSec: number };

export async function tryTakeSyncRateSlot(userId: string): Promise<RateSlotResult> {
  const { minIntervalSec } = getSyncGuardsConfig();
  const now = new Date();
  const cutoff = new Date(now.getTime() - minIntervalSec * 1000);

  const r = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }],
    },
    data: { lastSyncAt: now },
  });

  if (r.count > 0) return { ok: true };

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastSyncAt: true },
  });
  if (row?.lastSyncAt) {
    return { ok: false, retryAfterSec: retryAfterFromLastSync(row.lastSyncAt, minIntervalSec, now) };
  }
  return { ok: false, retryAfterSec: 1 };
}
