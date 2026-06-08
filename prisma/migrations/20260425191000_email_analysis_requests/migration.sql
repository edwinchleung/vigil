-- EmailAnalysisRequest: a DB-backed queue for user-triggered analysis.
-- Browser writes requests via Supabase (anon + user JWT); FastAPI consumes using service role.

-- Supabase typically has pgcrypto enabled already; we guard it for local/dev DBs.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "EmailAnalysisRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "emailId" TEXT,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),

  CONSTRAINT "EmailAnalysisRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailAnalysisRequest_mode_check" CHECK ("mode" IN ('single', 'all_unanalyzed')),
  CONSTRAINT "EmailAnalysisRequest_status_check" CHECK ("status" IN ('PENDING', 'CLAIMED', 'DONE', 'FAILED'))
);

-- RLS: allow the owning user to INSERT/SELECT their own requests (for button UX + status).
ALTER TABLE "EmailAnalysisRequest" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT ON TABLE "EmailAnalysisRequest" TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT ON TABLE "EmailAnalysisRequest" TO authenticated;
  END IF;
END
$$;

CREATE POLICY "email_analysis_request_select_own" ON "EmailAnalysisRequest"
  FOR SELECT
  TO anon, authenticated
  USING (coalesce((SELECT auth.jwt() ->> 'sub'), '') = "userId");

CREATE POLICY "email_analysis_request_insert_own" ON "EmailAnalysisRequest"
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (coalesce((SELECT auth.jwt() ->> 'sub'), '') = "userId");

-- Server-side (Prisma owner role) can UPDATE status/error; service_role JWT also bypasses RLS.

CREATE INDEX "EmailAnalysisRequest_user_status_created_idx"
  ON "EmailAnalysisRequest" ("userId", "status", "createdAt");

CREATE INDEX "EmailAnalysisRequest_status_created_idx"
  ON "EmailAnalysisRequest" ("status", "createdAt");

