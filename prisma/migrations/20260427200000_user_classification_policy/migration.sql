-- Per-user triage policy and optional RAG/intent numeric overrides (JSON).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "classificationPolicy" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiPreferences" JSONB;
