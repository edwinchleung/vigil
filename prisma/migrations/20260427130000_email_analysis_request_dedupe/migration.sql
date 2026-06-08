-- Prevent duplicate pending/claimed analysis requests per user.

-- One in-flight bulk request per user.
CREATE UNIQUE INDEX IF NOT EXISTS "EmailAnalysisRequest_inflight_bulk_unique"
  ON "EmailAnalysisRequest" ("userId", "mode")
  WHERE "emailId" IS NULL AND "status" IN ('PENDING', 'CLAIMED');

-- One in-flight single request per (user, email).
CREATE UNIQUE INDEX IF NOT EXISTS "EmailAnalysisRequest_inflight_single_unique"
  ON "EmailAnalysisRequest" ("userId", "emailId")
  WHERE "emailId" IS NOT NULL AND "mode" = 'single' AND "status" IN ('PENDING', 'CLAIMED');

