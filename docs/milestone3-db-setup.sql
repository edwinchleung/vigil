-- Run in Supabase SQL editor (or any Postgres with pgvector) before relying on
-- `Intent.embedding` (vector(384)) and the Milestone 3 Prisma migration.
-- The app migration `20260425190000_milestone3_intents_context` also issues this
-- so `bunx prisma migrate deploy` may already enable the extension in production.
CREATE EXTENSION IF NOT EXISTS vector;
