-- AlterTable: sync cooldown (rate limit) + cross-instance mutex
ALTER TABLE "User" ADD COLUMN "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "syncLockUntil" TIMESTAMP(3);
