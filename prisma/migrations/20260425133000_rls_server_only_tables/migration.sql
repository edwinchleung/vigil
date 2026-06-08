-- RLS for tables that are only accessed via Prisma on the server (NextAuth + SystemConfig).
-- No policies for anon/authenticated: the Data API cannot read or write these rows when using
-- the public anon key or a user JWT (default deny under RLS).
-- The migration/Prisma database role that owns these tables bypasses RLS (no FORCE), so the app is unchanged.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SystemConfig" ENABLE ROW LEVEL SECURITY;
