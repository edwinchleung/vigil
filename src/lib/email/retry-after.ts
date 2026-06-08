/** Pure helpers for sync guard “try again in N seconds” hints. */

export function retryAfterFromLastSync(
  lastSyncAt: Date,
  minIntervalSec: number,
  now: Date = new Date(),
): number {
  const nextAllowed = lastSyncAt.getTime() + minIntervalSec * 1000;
  return Math.max(1, Math.ceil((nextAllowed - now.getTime()) / 1000));
}

export function retryAfterFromLock(lockUntil: Date, now: Date = new Date()): number {
  return Math.max(1, Math.ceil((lockUntil.getTime() - now.getTime()) / 1000));
}
