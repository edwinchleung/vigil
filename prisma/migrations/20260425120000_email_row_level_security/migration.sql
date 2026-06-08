-- Row Level Security for "Email" (see docs/data-and-sync.md).
-- Browser Realtime uses the anon key with a custom JWT; policies restrict SELECT to the owning user.
-- Server-side Prisma uses the database role that owns the table and bypasses RLS (no FORCE), so sync and server renders keep working.

ALTER TABLE "Email" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT ON TABLE "Email" TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON TABLE "Email" TO authenticated;
  END IF;
END
$$;

CREATE POLICY "email_select_own" ON "Email"
  FOR SELECT
  TO anon, authenticated
  USING (coalesce((SELECT auth.jwt() ->> 'sub'), '') = "userId");
