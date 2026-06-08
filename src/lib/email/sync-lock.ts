/**
 * Sync mutex: see `sync-guards.ts` (row lease on `User.syncLockUntil`).
 * Kept for a stable import path; logic is in sync-guards to avoid
 * connection-pool pitfalls with `pg_advisory_lock`.
 */
export {
  getSyncGuardsConfig,
  tryAcquireUserSyncLock,
  releaseUserSyncLock,
  tryTakeSyncRateSlot,
} from "@/lib/email/sync-guards";
