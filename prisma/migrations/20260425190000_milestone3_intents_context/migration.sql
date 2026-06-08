-- Enable pgvector (no-op if already enabled; required for Intent.embedding)
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;

-- AlterTable Email
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "threadId" TEXT;
ALTER TABLE "Email" ADD COLUMN IF NOT EXISTS "actions" JSONB;

-- CreateTable Intent
CREATE TABLE IF NOT EXISTS "Intent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "embedding" vector(384),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Intent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Intent_userId_idx" ON "Intent"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Intent_userId_fkey'
  ) THEN
    ALTER TABLE "Intent" ADD CONSTRAINT "Intent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
