# Docker

Run Vigil as containerized **web** (Next.js) and **api** (FastAPI Context Engine) services. The database and Supabase API remain external for full features; optional compose profiles add local Postgres or Ollama.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine + Compose v2
- A [Supabase](https://supabase.com/) project (recommended for Realtime, analysis queue, and AI worker)
- OAuth credentials (Google, Microsoft) — same as [getting-started.md](getting-started.md)

## Quick start (local)

```bash
cp .env.docker.example .env.docker
# Fill in AUTH_SECRET, OAuth, Supabase URLs/keys, and LLM settings

docker compose up --build
```

- Web: [http://localhost:3000](http://localhost:3000)
- API health: [http://localhost:8000/health](http://localhost:8000/health)
- API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

On first start, the **web** container runs `prisma migrate deploy` when `RUN_MIGRATIONS=true` (default).

## Compose profiles

### `ollama` — local LLM

```bash
docker compose --profile ollama up --build
```

Set in `.env.docker`:

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
LLM_MODEL=gemma2:2b
```

Pull a model inside the Ollama container after startup:

```bash
docker compose exec ollama ollama pull gemma2:2b
```

### `local-db` — bundled Postgres (limited)

```bash
docker compose --profile local-db up --build
```

Set in `.env.docker`:

```env
DATABASE_URL=postgresql://vigil:vigil@postgres:5432/vigil?sslmode=disable
DIRECT_URL=postgresql://vigil:vigil@postgres:5432/vigil?sslmode=disable
WAIT_FOR_DB=true
APPLY_PG_STUB=true
```

**Limitations:** Plain Postgres supports Prisma/auth flows similar to CI e2e. It does **not** provide Supabase PostgREST, Realtime, or the Supabase client API the FastAPI worker uses. For AI analysis and live inbox updates, keep `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SUPABASE_*` pointed at your cloud project.

## Production

```bash
cp .env.docker.example .env.docker
# Set AUTH_URL to your public HTTPS origin (e.g. https://app.example.com)
# Set DATABASE_URL / DIRECT_URL to Supabase pooler URLs
# Set all OAuth and Supabase secrets

docker compose -f docker-compose.prod.yml up -d --build
```

Production checklist:

- Set **`AUTH_URL`** to the canonical site origin ([getting-started.md — Production checklist](getting-started.md#production-checklist))
- Update Google and Azure OAuth redirect URIs to your production domain
- Use a strong **`AUTH_SECRET`** (32+ characters)
- Expose the API publicly only if you need Supabase webhooks; otherwise keep it internal

## Environment variables

Use [`.env.docker.example`](../.env.docker.example) as the single template for both services. Compose loads it via `env_file: .env.docker`.

| Variable | Service | Purpose |
| --- | --- | --- |
| `AUTH_SECRET`, `AUTH_URL`, OAuth vars | web | Auth.js sessions and sign-in |
| `DATABASE_URL`, `DIRECT_URL` | web | Prisma / Postgres |
| `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_JWT_SECRET` | web | Browser Supabase client + RLS tokens |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | api | FastAPI reads/writes via Supabase API |
| `INTERNAL_AI_SECRET` | web + api | Webhook authentication |
| `LLM_PROVIDER`, `GROQ_API_KEY`, `OLLAMA_BASE_URL` | api | LLM for classification |
| `RUN_MIGRATIONS`, `WAIT_FOR_DB`, `APPLY_PG_STUB` | web | Container startup behavior |

## Images

| Image | Dockerfile | Notes |
| --- | --- | --- |
| web | [`docker/web.Dockerfile`](../docker/web.Dockerfile) | Bun build → Node standalone runtime |
| api | [`docker/api.Dockerfile`](../docker/api.Dockerfile) | Python 3.12 + uv; pre-downloads `all-MiniLM-L6-v2` |

The **api** image uses **CPU-only PyTorch** (~180MB) instead of PyPI’s Linux wheels, which pull multi-GB CUDA packages (`nvidia-*`, `triton`). Total image size is roughly **800MB–1GB** with `sentence-transformers`.

Build individually:

```bash
docker build -f docker/web.Dockerfile -t vigil-web .
docker build -f docker/api.Dockerfile -t vigil-api ./backend
```

## Architecture

```mermaid
flowchart TB
  subgraph containers [Docker]
    web[web_Nextjs_3000]
    api[api_FastAPI_8000]
    pg[postgres_optional]
    ollama[ollama_optional]
  end

  subgraph external [External]
    supabase[Supabase]
    oauth[OAuth_providers]
  end

  browser[Browser] --> web
  web --> supabase
  web --> pg
  api --> supabase
  api --> ollama
  web --> oauth
```

## Troubleshooting

| Issue | Fix |
| --- | --- |
| Web exits on startup: `AUTH_SECRET must be set` | Set `AUTH_SECRET` in `.env.docker` (32+ chars) |
| Sign-in: `UntrustedHost` / server configuration error | Set `AUTH_TRUST_HOST=true` and `AUTH_URL=http://localhost:3000` (compose sets `AUTH_TRUST_HOST` automatically) |
| `prisma migrate deploy` fails | Check `DATABASE_URL` / `DIRECT_URL`; for `local-db`, ensure `WAIT_FOR_DB=true` and postgres profile is active |
| Analyze buttons do nothing | FastAPI needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; worker must reach cloud Supabase |
| Ollama connection refused | Start with `--profile ollama` and set `OLLAMA_BASE_URL=http://ollama:11434` |
| Supabase webhooks cannot reach API | Expose port 8000 or deploy API behind a public URL; use a tunnel for local dev ([backend/README.md](../backend/README.md)) |

## Related docs

- [getting-started.md](getting-started.md) — OAuth and Supabase setup
- [development.md](development.md) — native dev scripts and testing
- [backend/README.md](../backend/README.md) — Context Engine and webhooks
