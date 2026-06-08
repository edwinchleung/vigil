-- Cache the email embedding so RAG grounding can reuse it instead of re-embedding
-- 25 recent rows on every classification call. The vector extension is already
-- enabled by the milestone3 intents migration; we guard it for local/dev DBs.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Email"
  ADD COLUMN IF NOT EXISTS "embedding" vector(384);
