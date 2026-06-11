# Development reference

## Scripts

From [`package.json`](../package.json):

| Command | Description |
| --- | --- |
| `bun run dev` | Next.js development server (default: http://localhost:3000) |
| `bun run build` | Production build |
| `bun run start` | Start production server (after `build`) |
| `bun run lint` | ESLint |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run prisma:generate` | Regenerate Prisma Client |
| `bun run prisma:migrate` | Create/apply a **new** migration in dev (after `schema.prisma` changes) — uses `dotenv -c` |
| `bun run prisma:deploy` | Apply **committed** migrations (clone / CI / production) — uses `dotenv -c` |
| `bun run prisma:studio` | Prisma Studio GUI — uses `dotenv -c` |
| `bun run test` | Unit and component tests (Vitest, one-shot) |
| `bun run test:watch` | Vitest in watch mode |
| `bun run test:e2e` | Browser smoke tests (Playwright) — see [Testing](#testing) |
| `bun run test:e2e:ui` | Playwright with interactive UI |
| `bun run check:prod-env` | When `CI=true`, asserts `AUTH_SECRET` is at least 32 characters ([`scripts/check-prod-env.mjs`](../scripts/check-prod-env.mjs)) |
| `bun run audit` | `bun audit --audit-level=high` (report/supply chain; exits non-zero on high or critical) |
| `postinstall` | Runs `prisma generate` after install |

From the repo root [`Makefile`](../Makefile) (optional):

| Command | Description |
| --- | --- |
| `make dev-web` | Same as `bun run dev` |
| `make dev-api` | FastAPI in `backend/` (requires [uv](https://docs.astral.sh/uv/)) — see [backend/README.md](../backend/README.md) |

FastAPI runtime configuration lives in [`backend/.env.example`](../backend/.env.example) and [`backend/README.md`](../backend/README.md) (keep API secrets out of `NEXT_PUBLIC_*`).

## Docker

To run containerized web + API instead of native dev servers, see [docker.md](docker.md).

```bash
cp .env.docker.example .env.docker
docker compose up --build
```

Optional profiles: `local-db` (bundled Postgres), `ollama` (local LLM). Production: `docker compose -f docker-compose.prod.yml up -d --build`.

## Running web + API together (local dev)

See [getting-started.md](getting-started.md) for first-time setup, OAuth, and running both services. Quick reference:

- Web app: `bun run dev` → http://localhost:3000
- FastAPI: `make dev-api` → http://127.0.0.1:8000

## Local LLM (Hong Kong-friendly) with Ollama

The FastAPI backend supports a pluggable LLM provider. For local development in regions where hosted providers are unavailable, you can run **Ollama** on the same machine and point the backend at it.

- Install and run Ollama, then pull a model (example):

```bash
ollama pull gemma2:2b
ollama serve
```

- Configure the backend (`backend/.env`):
  - `LLM_PROVIDER=ollama`
  - `OLLAMA_BASE_URL=http://localhost:11434`
  - `LLM_MODEL=gemma2:2b`

Other supported modes:
- **Groq**: `LLM_PROVIDER=groq` + `GROQ_API_KEY` (or `LLM_API_KEY`) + optional `LLM_MODEL`
- **OpenAI-compatible** (any host with `/v1/chat/completions`): `LLM_PROVIDER=openai_compatible` + `LLM_BASE_URL`/`OPENAI_BASE_URL` + `LLM_API_KEY`/`OPENAI_API_KEY` + `LLM_MODEL`

For the full provider/env-var mapping (including supported aliases and defaults), see [`backend/README.md`](../backend/README.md#pluggable-llm-providers-source-of-truth).

## Testing

The repo has two layers: **Vitest** for fast unit/component checks, and **Playwright** for end-to-end smoke tests against a running app.

### Unit and component tests (Vitest)

- **Command:** `bun run test` (or `bun run test:watch` during development).
- **Config:** `vitest.config.mts` (ESM), setup in `vitest.setup.ts` (e.g. `@testing-library/jest-dom`). Unit tests are only under `src/**`; `e2e/**` is excluded.
- **CI:** `bun run test` (which runs `vitest run`). For local unit/component tests you can also use `bun test`: [`bunfig.toml`](../bunfig.toml) limits discovery to `src/` and preloads a JSDOM setup so behavior matches Vitest. Playwright specs under `e2e/` are only run via `bun run test:e2e`.
- **Location:** `src/**/*.test.ts` and `src/**/*.test.tsx` (colocated with source).

These tests do not start the Next.js server; they use **jsdom** and exercise pure helpers, mappers, and simple UI (e.g. shadcn `Button`).

### End-to-end tests (Playwright)

- **Command:** `bun run test:e2e` (or `bun run test:e2e:ui` to debug).
- **Config:** `playwright.config.ts` — by default the **chromium** project runs specs under `e2e/`.
- **Dev server:** The config starts the app with `bun run dev` on `http://127.0.0.1:3000` if nothing is already listening (see `webServer` in `playwright.config.ts`). For CI, set `CI=1` so a fresh server is always started; locally, an existing `bun run dev` is reused when possible.
- **First-time browser install:** If Playwright errors about a missing browser, run `bunx playwright install chromium` (or `npx playwright install chromium`).
- **Base URL override:** `PLAYWRIGHT_BASE_URL` (e.g. against staging) overrides the default `http://127.0.0.1:3000`.
- **Artifacts:** Failing runs may write to `test-results/` and `playwright-report/` (gitignored).

E2E coverage is intentionally small (public home + sign-in). Protected routes that need a session are not part of the default suite.

## CI and dependency hygiene

- **Workflow:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on **push** to `main` or `master` and on **pull requests** from any branch. The **quality** job: `bun install --frozen-lockfile`, `check:prod-env` (step `env`: `CI=true` and `AUTH_SECRET` from workflow `env` key `AUTH_SECRET_PLACEHOLDER`), `lint`, `typecheck`, `bun run test`, `bun run build` (dummy `DATABASE_URL` / `DIRECT_URL` to `127.0.0.1:5432` if the build reads them; no DB service in this job), then **`bun audit --audit-level=high`**. The **e2e** job (after quality succeeds) starts a **Postgres 16** service; on the default **VM** runner, steps reach it at **`127.0.0.1:5432`** (the mapped port on the host — not the Docker service name `postgres`, which only resolves inside other containers). Then [`scripts/ci-postgres-stub-for-prisma.sql`](../scripts/ci-postgres-stub-for-prisma.sql), **`prisma migrate deploy`**, **`bunx playwright install --with-deps chromium`**, and **`bun run test:e2e`** with placeholder OAuth env. Prisma commands inherit the job `env` (no per-step DB env).
- **Editing CI env:** The `env` context cannot be used in a **job-level** `env` block in GitHub Actions, so the e2e job repeats the test `AUTH_SECRET` and DB URLs as **literals**. If you change `AUTH_SECRET_PLACEHOLDER` or the service connection string, update the e2e job `env` to match.
- **CI hardening:** `permissions: contents: read`, **concurrency** (cancel in-progress on the same ref), **Bun version** from [`package.json`](../package.json) `packageManager`, and **caching** for `~/.bun/install/cache`.
- **Dependabot:** [`.github/dependabot.yml`](../.github/dependabot.yml) requests weekly **JavaScript (npm registry)** and **GitHub Actions** updates (grouped for Actions to reduce PR noise). The repo uses **Bun** locally, but Dependabot still tracks `package.json` dependencies via the npm ecosystem.
- **Auth.js v5** is on a **beta** line; track [Auth.js / NextAuth releases](https://github.com/nextauthjs/next-auth/releases) and upgrade to a stable v5 when appropriate, then re-run the full test suite.

## Environment variables

Set secrets in **`.env.local`** (or `.env`); never commit real values. Keys mirror [`.env.example`](../.env.example):

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Auth.js signing/encryption; generate with `openssl rand -base64 32`. **Required in production** — the app throws on startup if missing ([`src/lib/ensure-auth-secret.ts`](../src/lib/ensure-auth-secret.ts)) |
| `AUTH_URL` | Public app URL (e.g. `http://localhost:3000` in dev); set the **canonical HTTPS origin** in production (see [getting-started.md — Production checklist](getting-started.md#production-checklist)) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client (Gmail / userinfo) |
| `AUTH_MICROSOFT_ENTRA_ID_ID` / `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Microsoft Entra app registration |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | e.g. `https://login.microsoftonline.com/common/v2.0` |
| `DATABASE_URL` | Postgres URL (Supabase pooler, typically port `6543` with PgBouncer-appropriate options for Prisma) |
| `DIRECT_URL` | Direct/session Postgres URL for Prisma **migrations** (often port `5432` on the pooler host) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (Settings → API); enables the **browser** Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase **anon** public key; used with Realtime when the URL/key pair is set (see [Data and sync — Realtime](data-and-sync.md#supabase-realtime-optional)) |
| `SUPABASE_JWT_SECRET` | **Server only** — same value as the Supabase project **JWT secret** (Settings → API). Used to sign short-lived user JWTs for `auth.jwt()` in RLS; required for [`POST /api/supabase-access-token`](../src/app/api/supabase-access-token/route.ts) |
| `INTERNAL_AI_SECRET` | Shared secret for Supabase → FastAPI webhooks (preferred: HMAC-signed `X-Timestamp` + `X-Signature`; fallback: `Authorization: Bearer <secret>`); optional mirror in `SystemConfig` (see [Data and sync](data-and-sync.md#systemconfig-and-webhook-secret)) |

## Prisma and multiple env files

- **Next.js** loads `.env`, `.env.local`, etc. automatically for the app.
- The **`prisma:*` scripts** use `bunx dotenv -c --` so **both** `.env` and `.env.local` are loaded (local overrides for duplicate keys). That avoids “works in Next but not in CLI” when only `.env.local` is populated.
- [getting-started.md](getting-started.md) recommends copying `.env.example` to `.env.local` and running `bun run prisma:deploy` after setting `DATABASE_URL` and `DIRECT_URL`.

## Troubleshooting (index)

| Topic | Where to read |
| --- | --- |
| Missing `User` / `Account` / `Session` tables, OAuth after fresh clone | [getting-started.md — Troubleshooting](getting-started.md#troubleshooting) |
| Supabase connection, pooler vs direct, `prisma:deploy` failures | [getting-started.md — Supabase](getting-started.md#1-supabase-postgres) and [Quick start](getting-started.md#quick-start) |
| Google Cloud OAuth, Gmail API scopes, redirect URI | [getting-started.md — Google](getting-started.md#2-google-cloud-console-gmail-api) |
| Azure Entra app, Graph permissions, redirect URI | [getting-started.md — Azure](getting-started.md#3-azure-portal-microsoft-graph--outlook) |
| `AUTH_SECRET` / session cookie issues in dev | Warning in [`src/auth.ts`](../src/auth.ts) and [getting-started.md — Auth.js secret](getting-started.md#4-authjs-secret) |
| Production start fails: `AUTH_SECRET must be set` | [getting-started.md — Production checklist](getting-started.md#production-checklist) ([`ensure-auth-secret.ts`](../src/lib/ensure-auth-secret.ts)) |
| Supabase Realtime not connecting / empty updates | [Data and sync — Realtime](data-and-sync.md#supabase-realtime-optional) (publication, env keys, RLS); ensure `SUPABASE_JWT_SECRET` and `POST /api/supabase-access-token` succeed (see [Architecture — Supabase and RLS](architecture.md#supabase-and-rls)) |

For product roadmap and future operational pieces (webhooks, FastAPI), see [product-development-plan.md](../product-development-plan.md).
