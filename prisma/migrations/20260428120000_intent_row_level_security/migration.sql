-- RLS for "Intent" (align with User/Account/Session — see 20260425133000_rls_server_only_tables).
-- No policies for anon/authenticated: the Data API cannot read or write Intents with the public anon
-- key or a user JWT (default deny under RLS). Realtime is not used for Intent in this app.
-- The migration/Prisma database role that owns the table bypasses RLS (no FORCE ROW LEVEL SECURITY),
-- so server actions, FastAPI (service role), and Prisma remain unchanged.

ALTER TABLE "Intent" ENABLE ROW LEVEL SECURITY;
