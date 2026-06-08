# Getting started with Vigil

This guide covers **first-time setup**: prerequisites, environment files, database migrations, OAuth providers, the FastAPI Context Engine, troubleshooting, and production basics.

For what Vigil does as a product, start with [features.md](features.md) or the [README](../README.md).

## Prerequisites

- [bun](https://bun.sh/) >= 1.3
- Node >= 20.18 (required for Prisma 6)
- A [Supabase](https://supabase.com/) project (free tier is fine)
- A [Google Cloud](https://console.cloud.google.com/) project with the Gmail API enabled
- A [Microsoft Azure](https://portal.azure.com/) tenant where you can register an app
- [uv](https://docs.astral.sh/uv/) on your `PATH` (for the FastAPI backend)

## Quick start

```bash
bun install
cp .env.example .env.local     # then fill in every value — see below
bun run prisma:deploy          # apply committed migrations (User, Email, Intent, RLS, etc.)
bun run dev                    # http://localhost:3000
```

### Environment files

- **Next.js** loads `.env`, `.env.local`, etc. automatically.
- **Prisma CLI** reads `.env` by default, not `.env.local`. The `prisma:*` scripts use `dotenv -c` so **both** `.env` and `.env.local` are loaded (`.env.local` wins for duplicate keys).
- Recommended: copy [`.env.example`](../.env.example) to **`.env.local`** and put secrets there.

### Migrations: deploy vs migrate

| Command | When to use |
| --- | --- |
| `bun run prisma:deploy` | After clone, CI, or production — applies **committed** migrations |
| `bun run prisma:migrate` | After you **change** `prisma/schema.prisma` and need a **new** migration |

## Configuring OAuth and database

Everything below assumes local development at `http://localhost:3000`. Repeat each redirect URI with your production domain when you ship.

### 1. Supabase (Postgres)

1. Create a new project in <https://supabase.com/dashboard>.
2. Go to **Project Settings → Database → Connection string**.
3. Copy the **Transaction pooler** string (port `6543`) into `DATABASE_URL`.
4. Copy the **Direct connection** string (port `5432`) into `DIRECT_URL`.
5. Both strings should include `?sslmode=require` already. Paste them into `.env.local`.

For pgvector (embeddings), migrations enable the extension automatically. A standalone snippet is in [milestone3-db-setup.sql](milestone3-db-setup.sql).

**Supabase API keys** (for Realtime and analysis queue from the browser):

- `NEXT_PUBLIC_SUPABASE_URL` — Project Settings → API
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon public key
- `SUPABASE_JWT_SECRET` — JWT secret (server only; signs tokens for RLS)

### 2. Google Cloud Console (Gmail API)

1. <https://console.cloud.google.com/> → create or select a project.
2. **APIs & Services → Library → Gmail API → Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - Add scopes: `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `.../auth/gmail.readonly`
   - Add your own Google account as a **Test user** while the app is unverified.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorised redirect URI: `http://localhost:3000/api/auth/callback/google`
5. Copy the **Client ID** into `AUTH_GOOGLE_ID` and **Client secret** into `AUTH_GOOGLE_SECRET`.

### 3. Azure Portal (Microsoft Graph / Outlook)

1. <https://portal.azure.com/> → **Microsoft Entra ID → App registrations → New registration**.
2. Name: `Vigil (dev)`. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**. Redirect URI: **Web** → `http://localhost:3000/api/auth/callback/microsoft-entra-id`.
3. On the created app, **Certificates & secrets → New client secret**. Copy the **Value** (not the Secret ID) into `AUTH_MICROSOFT_ENTRA_ID_SECRET`.
4. Copy **Application (client) ID** into `AUTH_MICROSOFT_ENTRA_ID_ID`.
5. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**:
   - `User.Read`
   - `Mail.Read`
   - `offline_access`
6. Leave `AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/common/v2.0` unless you want to restrict sign-in to a single tenant (then replace `common` with the Directory (tenant) ID).

### 4. Auth.js secret

```bash
openssl rand -base64 32
```

Put the output into `AUTH_SECRET`.

In development, a missing `AUTH_SECRET` may log a warning. In **production**, the app **fails to start** without it — see [`src/lib/ensure-auth-secret.ts`](../src/lib/ensure-auth-secret.ts).

## FastAPI backend (local, second terminal)

The Context Engine runs as a separate Python service in [`backend/`](../backend/).

```bash
cd backend
cp .env.example .env    # required for full AI processing
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Or from the repo root: `make dev-api` (see [Makefile](../Makefile)).

- **Health check:** [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
- **OpenAPI UI:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

**Notes:**

- You can start the server and use `/health` + `/docs` without configuring Supabase or an LLM.
- For **AI processing** (Analyze buttons or webhooks), set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and your LLM key(s) in `backend/.env` (see [`backend/.env.example`](../backend/.env.example) and [backend/README.md](../backend/README.md)). Webhooks additionally require `INTERNAL_AI_SECRET`.
- **Do not** put backend secrets in `NEXT_PUBLIC_*` or other client-exposed Next.js env vars.

### Webhooks and local tunnels

If your Supabase project is in the cloud, it cannot call `127.0.0.1` directly. Use a tunnel (e.g. `ngrok http 8000`) and point the Supabase webhook at `https://<tunnel-host>/api/webhooks/email`. Webhook auth (HMAC headers) is documented in [backend/README.md](../backend/README.md).

### Running web + API together

| Service | Command | URL |
| --- | --- | --- |
| Next.js | `bun run dev` or `make dev-web` | http://localhost:3000 |
| FastAPI | `make dev-api` or `uv run vigil-api` in `backend/` | http://127.0.0.1:8000 |

## Production checklist

Auth.js is configured with `trustHost: true` in [`src/auth.config.ts`](../src/auth.config.ts) so OAuth callbacks work behind common hosting proxies. In production you should still **fix the public URL** and **terminate TLS** at a trusted edge:

- Set **`AUTH_URL`** to the canonical site origin (e.g. `https://app.example.com`). Auth.js and OAuth redirect URIs must match that origin.
- Serve the app only over **HTTPS**; do not allow arbitrary or spoofed `Host` headers to reach the application.
- Set a strong **`AUTH_SECRET`** (e.g. `openssl rand -base64 32`). The server fails to start in production if it is missing.
- **HTTP security headers** (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`, and in production **HSTS** + `upgrade-insecure-requests` in CSP) are set in [`next.config.ts`](../next.config.ts).
- The Supabase browser client obtains a short-lived JWT via **`POST /api/supabase-access-token`**: responses are non-cacheable, **`GET` returns 405**, and the route uses in-memory rate limits per IP / user.
- Inbox **sync** errors shown in the UI are **generic**; full provider errors are **logged on the server** only.

Update OAuth redirect URIs in Google Cloud and Azure to your production domain.

## Troubleshooting

### `The table public.Account does not exist` (Google / Microsoft sign-in)

**Cause:** The database has never had Prisma migrations applied. Auth.js needs `User`, `Account`, `Session`, and related tables.

**Fix:** With `DATABASE_URL` and `DIRECT_URL` set in `.env.local`, run:

```bash
bun run prisma:deploy
```

Then try OAuth again. If deploy fails with a connection error, confirm Supabase is reachable, `DIRECT_URL` uses port `5432`, and your network allows outbound TLS to the Supabase host.

### Supabase Realtime not updating the inbox

See [data-and-sync.md — Supabase Realtime](data-and-sync.md#supabase-realtime-optional): enable Realtime on the `Email` table, set public Supabase env vars, and ensure `SUPABASE_JWT_SECRET` and `POST /api/supabase-access-token` succeed.

### Production start fails: `AUTH_SECRET must be set`

Set `AUTH_SECRET` in the deployment environment ([`src/lib/ensure-auth-secret.ts`](../src/lib/ensure-auth-secret.ts)).

### More topics

| Topic | Where to read |
| --- | --- |
| Environment variable reference | [development.md — Environment variables](development.md#environment-variables) |
| CI and dependency hygiene | [development.md — CI](development.md#ci-and-dependency-hygiene) |
| Architecture and RLS | [architecture.md](architecture.md) |
| FastAPI processing and webhooks | [backend/README.md](../backend/README.md) |

## Next steps

- [features.md](features.md) — how to use the inbox, intents, and settings
- [development.md](development.md) — scripts, testing, local LLM (Ollama)
- [architecture.md](architecture.md) — technical flows and module map
