# Data model and sync behavior

## Prisma schema

Defined in [`prisma/schema.prisma`](../prisma/schema.prisma).

Migrations in [`prisma/migrations/`](../prisma/migrations/) apply in order: `20250424180000_init` (Auth.js + `Email` base) → `20260424181403_milestone3_ai_bridge` (`AiStatus`, AI columns, `SystemConfig`) → `20260425120000_email_row_level_security` (RLS on `Email`) → `20260425133000_rls_server_only_tables` (RLS on other tables, no client policies) → `20260425150000_user_sync_guards` → `20260425190000_milestone3_intents_context` (**pgvector** `CREATE EXTENSION IF NOT EXISTS vector`, `User.telegramChatId`, `Email.threadId` / `actions`, **`Intent`** table with `vector(384)` embedding column) → `20260425191000_email_analysis_requests` → `20260426193000_email_embedding` (**`Email.embedding`** `vector(384)` — cached text embedding for internal RAG / similarity) → `20260427200000_user_classification_policy` (**`User.classificationPolicy`** text, **`User.aiPreferences`** JSON for optional RAG/intent overrides) → `20260428120000_intent_row_level_security` (RLS on **`Intent`**, default deny for API clients). Use `bun run prisma:deploy` after `DATABASE_URL` and `DIRECT_URL` are set. For a minimal SQL snippet to enable pgvector only, see [`milestone3-db-setup.sql`](milestone3-db-setup.sql).

### Auth.js tables

- **`User`** — application user; links to `Account`, `Session`, app-owned `Email` and **`Intent`** rows. Optional **`telegramChatId`** (string) for future Telegram bypass notifications. Sync guards: **`lastSyncAt`**, **`syncLockUntil`** (see sync table below). Optional **classification preferences** for the Context Engine: **`classificationPolicy`** (`Text`, free-form instructions injected into the LLM user prompt as `<user_preferences>`) and **`aiPreferences`** (`Json`, optional keys `groundingSimilarityFloor`, `groundingExampleLimit`, `intentMatchLimit` — validated and clamped in the FastAPI worker; see [User classification preferences](#user-classification-preferences)).
- **`Account`** — OAuth provider account per user; stores `access_token`, `refresh_token` (`Text`), `expires_at`, `scope`, etc. The **provider** string values used in code include `google` and `microsoft-entra-id` (see sync logic in [`src/lib/email/sync.ts`](../src/lib/email/sync.ts)).
- **`Session`** — database session strategy; session token and expiry.
- **`VerificationToken`** — Auth.js email flow (if used).

### Application table: `Email`

Rows represent **cached** messages for the global inbox. Important fields:

| Field | Purpose |
| --- | --- |
| `userId` | Owner; cascades on user delete |
| `provider` | e.g. `google` or `microsoft-entra-id` (stored as string) |
| `externalId` | Provider’s stable message id |
| `subject`, `sender`, `snippet` | List/preview text |
| `receivedAt` | Sorting and display |
| `isRead` | Read flag from provider at sync time |
| `raw` | Provider payload (`Json`) captured at sync time (includes body when available) |
| `aiStatus` | `PENDING` → `PROCESSING` → `COMPLETED` (or `FAILED`); set by Next.js sync and AI backend |
| `threadId` | Optional provider thread id (Gmail `threadId`, Microsoft Graph `conversationId`) for thread-aware ranking |
| `vigilScore`, `category`, `summary` | Filled by the AI pipeline; `category` drives tri-tier labels (e.g. Critical, Relevant, Low-Value) |
| `actions` | Optional `Json` — AI-extracted tasks (recommended shape documented in [`backend/README.md`](../backend/README.md#actions-json-recommended-shape)) |
| `embedding` | Optional `vector(384)` — cached **embedding of the same text** the pipeline sends to the LLM (see [`backend/README.md`](../backend/README.md#processing-flow)); written on successful classification so the next run can fetch similar completed emails without re-embedding a window of old mail |

**`Intent` (Milestone 3):** per-user **active intents** for the Context Engine — `query` (natural language), optional `deadline`, `isActive`, optional **`embedding`** as `vector(384)` in Postgres (Prisma `Unsupported("vector(384)")?`). Embeddings are intended to be written by the Python backend, not by Next.js. Server actions live in [`src/lib/intents/actions.ts`](../src/lib/intents/actions.ts). **RLS** is **enabled** on `Intent` with **no** permissive policies for `anon` / `authenticated` (same model as `User` / `SystemConfig`); the app reads/writes intents through **Prisma** (and FastAPI uses the service role) — see [Row Level Security (Supabase)](#row-level-security-supabase).

**`SystemConfig`:** see [SystemConfig and webhook secret](#systemconfig-and-webhook-secret).

**Dedupe / upsert key:** `@@unique([provider, externalId, userId])` — the same message from the same provider for the same user is updated in place, not duplicated.

**Index:** `@@index([userId, receivedAt])` for listing recent mail per user.

## Row Level Security (Supabase)

The **anon** key is public; anyone can call the Supabase **REST** and **Realtime** APIs against your project. RLS limits what those clients can do.

| Table | Role | Migration | Behavior |
| --- | --- | --- | --- |
| `Email` | User-scoped inbox / Realtime | `20260425120000_email_row_level_security` | Policy allows `SELECT` for `anon` / `authenticated` only when `auth.jwt() ->> 'sub'` matches `userId` (custom JWT from [`POST /api/supabase-access-token`](../src/app/api/supabase-access-token/route.ts)). |
| `User`, `Account`, `Session`, `VerificationToken`, `SystemConfig` | Server-only (Prisma) | `20260425133000_rls_server_only_tables` | RLS **enabled** with **no** permissive policies → default **deny** for API clients. **Account** (OAuth tokens) and **SystemConfig** (webhook secret) are not exposed via the anon key. |
| `Intent` | Server-only (Prisma + service role) | `20260428120000_intent_row_level_security` | RLS **enabled** with **no** permissive policies → default **deny** for anon/authenticated Data API. Intents are not read via the browser Supabase client in this app. |

Server-side **Prisma** uses the database user that **owns** these tables (typical for Supabase + `prisma migrate`), so it **bypasses** RLS and behavior is unchanged. If you connect Prisma as a non-owner role, you must use a role with `BYPASSRLS` or add policies—see Supabase and PostgreSQL docs.

## TypeScript unified model

[`src/types/unified-email.ts`](../src/types/unified-email.ts) defines:

- `EmailProvider`: `"google" | "microsoft-entra-id"`.
- `UnifiedEmail` — in-app view: `externalId`, `provider`, `subject`, `sender`, `content` (preview), `timestamp`, `isRead`, optional Prisma `id`, and optional AI fields when loaded from the DB.
- For the **inbox** UI, the JSON-serialisable **`InboxEmailView`** (including `aiStatus`, `vigilScore`, `category`, `summary`, **`threadId`**, **`actions`**, and `timestamp` as an ISO string) is defined and mapped in [`src/lib/email/map-prisma.ts`](../src/lib/email/map-prisma.ts), not in `unified-email.ts`.

`content` in Milestone 2 is **preview** text; full bodies can be added in a later milestone.

## Mapping from Prisma

[`src/lib/email/map-prisma.ts`](../src/lib/email/map-prisma.ts):

- `prismaEmailToUnified` / `prismaEmailToInboxView` — map `Email` to `UnifiedEmail` or a JSON-serialisable **`InboxEmailView`** (ISO string timestamps for the client).

## Sync and inbox limits

| Behavior | Value | Where |
| --- | --- | --- |
| **Sync cooldown + mutex (per user)** | Default **1 start / 60s**; only **one** sync lease at a time (cross-instance) | `User.lastSyncAt` + `User.syncLockUntil` in Prisma; guards in `src/lib/email/sync-guards.ts` and `src/lib/email/actions.ts` — override with `SYNC_MIN_INTERVAL_SEC`, `SYNC_LOCK_TTL_SEC`, `SYNC_LOCK_BUSY_RETRY_SEC` (see [`.env.example`](../.env.example)) |
| Max messages fetched **per provider** per sync | Bounded by batch size (UI currently offers **40** or **100**; default **40**) | `limit` passed to `syncInboxForUser` / provider fetchers |
| Max rows loaded on **inbox page** (initial server render) | `200` | `take: 200` in [`src/app/(protected)/dashboard/inbox/page.tsx`](../src/app/(protected)/dashboard/inbox/page.tsx) |
| Search | Client-side filter on the **loaded** messages | [`src/components/inbox-feed.tsx`](../src/components/inbox-feed.tsx) — does not call Gmail/Graph or Prisma for search |
| Tri-tier filter | Client-side filter on **`category`** after search (All / Critical / Relevant / Low-Value) | [`src/lib/inbox/inbox-display.ts`](../src/lib/inbox/inbox-display.ts) (`emailMatchesInboxTier`), used in `inbox-feed.tsx` |
| **Realtime (optional)** | `UPDATE` on `Email` (filter `userId=eq.<userId>`) merges into already-loaded rows | `InboxFeed` + `getSupabaseBrowserClient` in [`src/lib/supabase/browser-client.ts`](../src/lib/supabase/browser-client.ts). **No `INSERT` listener** — new messages after sync show up on **refresh** (or the next server render after `revalidatePath` from sync) |

Note: the server action reads `limit` from submitted form data; the UI currently constrains this to 40/100.

**Sync performance notes (implementation detail):**

- Providers are synced **in parallel** when both are linked (Google + Microsoft).
- Gmail message fetch is performed with **bounded concurrency** and uses **partial responses** (fields selection) while still retrieving **full message payload** for `Email.raw`.
- Database work avoids per-message reads by **prefetching existing rows** for a provider batch, then doing Prisma `upsert` calls with **bounded concurrency**.
- The sync logs timing info server-side (`fetch_ms`, `upsert_ms`, `total_ms`) to help diagnose remaining slowness (provider API latency vs DB).
- The inbox supports **pagination in batches**: when the sync returns a cursor, the UI shows **Sync next batch** to continue.
- The inbox also supports **Auto sync**: it will keep submitting “next batch” until the cursor is exhausted (use **Stop** to halt).

**Sync / AI state:** New rows are created with `aiStatus: PENDING`. If an existing row’s **subject, sender, snippet, or threadId** differ from the incoming provider payload, `aiStatus` is reset to `PENDING` and `vigilScore`, `category`, `summary`, and **`actions`** are cleared. The check is implemented in [`src/lib/email/content-changed.ts`](../src/lib/email/content-changed.ts) (`contentMeaningfullyChanged`); read-only or trivial field updates (e.g. `isRead` only) do not reset AI fields.

**Partial accounts:** If the user linked only one provider, only that provider is synced. Providers are determined by which `Account` rows exist for the user (see `prisma.account.findMany` in sync).

## Supabase Realtime (optional)

The inbox **subscribes to Realtime** when both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. If either is missing, the feed still works; live DB updates are simply disabled.

1. **Env:** Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (see [`.env.example`](../.env.example)) — from **Project Settings → API** in the Supabase dashboard.
2. **Replication:** In the Supabase dashboard, enable Realtime for the **`Email`** table (e.g. **Database → Publications** and include `Email` in the `supabase_realtime` publication, or the **Realtime** UI to add the table; wording may vary by dashboard version).
3. **Security:** The inbox uses the **anon** key with a **custom JWT** minted by `POST /api/supabase-access-token` (signed with `SUPABASE_JWT_SECRET`, same as the project’s JWT secret). **Row Level Security** on `Email` allows `SELECT` only when `auth.jwt() ->> 'sub'` matches `userId`. Other app tables use RLS without client policies so the Data API cannot read **User** / **Account** / **Session** / **VerificationToken** / **SystemConfig** / **`Intent`**; see [Row Level Security (Supabase)](#row-level-security-supabase). Set `SUPABASE_JWT_SECRET` in the server environment and run `prisma migrate deploy`.

**FastAPI / webhooks (Milestone 4):** Supabase triggers the FastAPI Context Engine via a webhook:

- **Endpoint:** `POST /api/webhooks/email` (see [`backend/README.md`](../backend/README.md))
- **Endpoint:** `POST /api/webhooks/intent` (see [`backend/README.md`](../backend/README.md)) — generate/persist `Intent.embedding`
- **Auth (preferred):** HMAC-signed `X-Timestamp` + `X-Signature` (optional mirror in `SystemConfig.internal_api_secret`)
- **Auth (fallback):** `Authorization: Bearer <INTERNAL_AI_SECRET>`
- **Storm protection:** the handler **only enqueues** work and returns `200` immediately; LLM/embedding work happens in a **sequential background worker**.
- **Status lifecycle:** `Email.aiStatus` transitions `PENDING → PROCESSING → COMPLETED` (or `FAILED` on errors), and the inbox can receive these updates via Supabase Realtime `UPDATE` events.

FastAPI uses the **Supabase service role** key to read/write rows and bypass RLS for processing.

### Email body extraction for LLM classification

The Python backend does **not** pass the full `Email.raw` JSON to the LLM. Instead it extracts a readable body:

- Gmail: decodes Base64URL content from MIME parts (`payload.parts[].body.data`), falling back to RFC822 (`raw`) when needed.
- Microsoft Graph: uses `body.content` (HTML is stripped to text).

This reduces prompt noise and significantly improves classification quality.

### Internal RAG and optional web context (Milestone 4+)

The FastAPI worker does not paste retrieved context into the `email` body string. It builds:

- **Similar internal examples** — from recent **`COMPLETED`** rows with non-null `Email.embedding`, cosine-scored against the current message’s embedding, with a similarity floor and one example per category when possible. **Defaults** (similarity floor ~0.55, up to 3 examples, intent match limit from `INTENT_MATCH_LIMIT`) can be **overridden per user** via `User.aiPreferences` (see [User classification preferences](#user-classification-preferences)). These appear in the prompt under explicit tags (see [Processing flow](../backend/README.md#processing-flow)).
- **Web snippets** (optional) — when `WEB_GROUNDING_ENABLED` and `TAVILY_API_KEY` are set, a privacy-minimized search from sender + subject; also tagged so the model does not treat snippets as the email to classify.

### User classification preferences

Stored on **`User`** (Prisma: `classificationPolicy`, `aiPreferences`).

| Field | Type | Role |
| --- | --- | --- |
| `classificationPolicy` | `Text?` | Optional free-text notes (max length enforced in app code). Injected into the LLM **user** turn inside `<user_preferences>...</user_preferences>`. Does **not** change the three canonical category strings (`Critical` / `Relevant` / `Low-Value`); it steers how the model applies the fixed rubric. |
| `aiPreferences` | `Json?` | Optional object. Recognized keys: `groundingSimilarityFloor` (0.1–0.95), `groundingExampleLimit` (1–10), `intentMatchLimit` (1–15). Omitted keys fall back to server defaults (`INTENT_MATCH_LIMIT` for intent count). Read and clamped in [`backend/app/services/user_preferences.py`](../backend/app/services/user_preferences.py). |

**Next.js** — users edit these on [`/dashboard/settings`](../src/app/(protected)/dashboard/settings/page.tsx) via [`updateClassificationPreferencesAction`](../src/lib/settings/actions.ts) (Prisma). **FastAPI** reads the same columns via Supabase in [`EmailRepository.get_user_classification_settings`](../backend/app/services/email_repository.py) during email processing ([`EmailPipeline`](../backend/app/services/pipeline.py)). With `RAG_DEBUG_LOGS`, the worker can log a short **`policy_fingerprint`** (hash prefix) for support/debugging, not the full policy text in routine logs.

## SystemConfig and webhook secret

**`SystemConfig`:** single row (e.g. `id = "default"`) with `internalApiSecret` (column `internal_api_secret`) for authenticating **Supabase → FastAPI** webhooks. You can mirror `INTERNAL_AI_SECRET` from env for DB-driven config.

## Broader scope notes

- **FastAPI** and **database webhooks** that call `POST /api/webhooks/email` are part of Milestone 4 in this repo; see [`backend/README.md`](../backend/README.md). Future work expands this to additional triggers (for example, intent-change embedding generation), but the email ingest webhook path is already implemented.
- **pgvector** is enabled in the DB for **`Intent.embedding`** and (after migration `20260426193000_email_embedding`) optional **`Email.embedding`** (see `20260425190000_milestone3_intents_context` and [`milestone3-db-setup.sql`](milestone3-db-setup.sql)). Next.js does not write those vectors; the Python service does. **`Email.raw`** remains the main source for body extraction and indexing ideas.
- **Full message body** in the unified `content` field is still future work — list view uses **snippet/preview** only.

## Context Engine UI (Milestone 3)

| Route | Purpose |
| --- | --- |
| `/dashboard/intents` | Create, edit, delete, and toggle **active intents** ([`src/app/(protected)/dashboard/intents/page.tsx`](../src/app/(protected)/dashboard/intents/page.tsx), [`src/components/intents/intent-manager.tsx`](../src/components/intents/intent-manager.tsx)) |
| `/dashboard/settings` | **Telegram** — optional `User.telegramChatId` ([`TelegramSettingsForm`](../src/components/settings/telegram-settings-form.tsx)). **AI classification** — `User.classificationPolicy` and optional `User.aiPreferences` ([`ClassificationSettingsForm`](../src/components/settings/classification-settings-form.tsx); server actions in [`src/lib/settings/actions.ts`](../src/lib/settings/actions.ts); shared types in [`src/lib/settings/types.ts`](../src/lib/settings/types.ts)) ([`src/app/(protected)/dashboard/settings/page.tsx`](../src/app/(protected)/dashboard/settings/page.tsx)) |

Shared header navigation is defined in [`src/lib/dashboard-nav.ts`](../src/lib/dashboard-nav.ts).
