# Vigil API (FastAPI Context Engine)

For Vigil users, this service powers **AI triage**: it reads synced mail, matches it against your **active intents** and classification policy, and writes back **Vigil score**, **category**, **summary**, and **extracted actions** so the inbox can filter Critical vs Low-Value mail. Processing runs in a background worker so the UI stays responsive.

The FastAPI **Context Engine** runs AI analysis in a sequential background worker and can be triggered via:

- **Pull queue (recommended):** the Next.js frontend inserts rows into `EmailAnalysisRequest` via Supabase RLS; FastAPI polls and processes them.
- **Webhooks (optional):** Supabase can call `POST /api/webhooks/email` to enqueue a single email (enqueue-only).

## Setup

Install [uv](https://docs.astral.sh/uv/) (recommended) or use a virtualenv.

```bash
cd backend
cp .env.example .env
uv sync
```

## Run

```bash
cd backend
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

or:

```bash
cd backend
uv run vigil-api
```

- Health: `GET http://127.0.0.1:8000/health`
- OpenAPI docs: `http://127.0.0.1:8000/docs`

## API surface (current)

- `GET /health` — simple health check (`{"status":"ok"}`)
- `POST /api/webhooks/email` — enqueue AI processing for a single `Email` row
- `POST /api/webhooks/intent` — enqueue embedding refresh for a single `Intent` row

There is intentionally **no** public “analyze this email” endpoint for the browser. The UI triggers analysis by writing `EmailAnalysisRequest` rows to Supabase.

All write endpoints are authenticated with a shared secret (see below). Webhook handlers **only authenticate and enqueue**; all embedding/LLM work happens in the background worker.

## Webhook endpoints

`POST /api/webhooks/email`

`POST /api/webhooks/intent`

Required JSON body:

For email:

```json
{
  "email_id": "email-row-id",
  "user_id": "user-row-id"
}
```

For intent:

```json
{
  "intent_id": "intent-row-id",
  "user_id": "user-row-id"
}
```

Required header:

```text
X-Timestamp: <unix_seconds>
X-Signature: <hex_hmac_sha256(secret, `${timestamp}.${raw_body}`)>
```

Compatibility:
- The backend still accepts `Authorization: Bearer <INTERNAL_AI_SECRET>` as a fallback, but **prefer signed requests**.

Auth failure modes:
- Missing backend config (`INTERNAL_AI_SECRET` not set): **503** `{"detail":"Webhook secret is not configured"}`
- Wrong/missing header: **401** `{"detail":"Unauthorized"}`

Behavior:
- Valid request is acknowledged immediately with `200 {"status":"queued"}`.
- Request handler only authenticates and enqueues.
- AI processing happens in the background worker.

### Intent webhook wiring (deployment note)

`POST /api/webhooks/intent` is implemented and can be used to refresh `Intent.embedding` on-demand. Whether your **Supabase project is configured to call it automatically** on `Intent` `INSERT/UPDATE` is deployment-specific.

## Supabase webhook setup (cloud → FastAPI)

Configure a database/webhook sender in Supabase to call the endpoint above whenever an `Email` row is created/updated for AI processing.

- **URL**: `https://<your-api-host>/api/webhooks/email`
  - Local dev: you’ll need a tunnel (see below), because Supabase can’t reach `127.0.0.1`.
- **Method**: `POST`
- **Headers**:

```text
Content-Type: application/json
X-Timestamp: <unix_seconds>
X-Signature: <hex_hmac_sha256(secret, `${timestamp}.${raw_body}`)>
```

- **Body**: the minimal payload the FastAPI handler expects:

```json
{
  "email_id": "email-row-id",
  "user_id": "user-row-id"
}
```

### Local development (Supabase → localhost)

If your Supabase project is in the cloud, you can expose your local API with a tunnel:

```bash
ngrok http 8000
```

Then use the forwarded `https://...ngrok-free.app` URL as your webhook base, e.g. `https://<ngrok-host>/api/webhooks/email`.

## Frontend-triggered analysis (recommended)

The inbox UI provides:

- **Analyze this email** (detail view)
- **Analyze all not analyzed** (inbox)

These buttons do **not** call FastAPI. They insert into a Supabase table:

- Table: `EmailAnalysisRequest`
- Modes:
  - `single` (requires `emailId`)
  - `all_unanalyzed` (`emailId` is null)

FastAPI polls for `status='PENDING'`, claims rows, and enqueues `EmailTask`s.

### Setup checklist

1. Apply DB migrations (creates `EmailAnalysisRequest` + RLS policies):

```bash
cd ..
bun run prisma:deploy
```

2. Ensure Next.js Supabase env is set (for browser insert + Realtime):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_JWT_SECRET` (server-only; used to sign short-lived user JWTs so RLS can enforce `userId` ownership)

3. Ensure FastAPI env is set (to read/write Supabase + run the worker):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENABLE_WORKER=true`

4. Start FastAPI and Next.js, then click an Analyze button.

## Processing flow

1. Mark email `aiStatus` as `PROCESSING`.
2. Load email, **`User` classification fields** (`classificationPolicy`, `aiPreferences`), and active intents from Supabase. Sanitize and clamp user preferences in [`app/services/user_preferences.py`](app/services/user_preferences.py) (policy max length, numeric bounds).
3. Extract readable email text from `Email.raw` (Base64URL decode + MIME selection for Gmail, `body` for Microsoft Graph) as `email_text` (subject, From, Snippet, body, optional links). This string is the **only** message the model classifies; it is *not* mixed with RAG or web context.
4. Build one embedding of `email_text` with `all-MiniLM-L6-v2` (configurable via `EMBEDDING_MODEL_NAME`) — same 384-d space as `Intent.embedding`.
5. **Internal RAG (few-shot):** load up to 25 most recent `COMPLETED` emails for the same user that have a non-null `Email.embedding` (pgvector), score cosine similarity to the current embedding, keep matches above a **similarity floor** (default ~0.55; overridable per user via `User.aiPreferences.groundingSimilarityFloor`), and pick up to **N** examples (default 3; overridable via `groundingExampleLimit`) with per-category diversity (Critical / Relevant / Low-Value). Each example is a short **scenario** (subject/sender/snippet) plus the prior `category` / `vigilScore` / `summary` — not a second copy of the full body.
6. **Optional web grounding** (`WEB_GROUNDING_ENABLED=true`): build a small Tavily search query from From + Subject and append public snippets in a **separate** block; never treated as the email body.
7. Rank top-N active intents with Python cosine vs `Intent.embedding` (default N from `INTENT_MATCH_LIMIT`; overridable per user via `User.aiPreferences.intentMatchLimit`); only `query` and optional `deadline` are sent to the LLM (no raw embedding vector in the prompt).
8. Classify via the configured provider (Groq / Ollama / OpenAI-compatible) with a structured prompt: **core** system rubric, few-shot examples, optional **`<user_preferences>`** (from `User.classificationPolicy` when set), then tagged sections `## Input` / `<active_intents>`, optional `<similar_classified_emails>`, optional `<web_context>`, and `<email>...</email>`. The model must return JSON with a hidden `reasoning` string (one–two sentences) plus `category`, `vigilScore`, `summary`, `actions` — the backend **strips** `reasoning` before persisting.
9. Persist `vigilScore`, `category`, `summary`, `actions`, set `aiStatus=COMPLETED`, and store the **same** embedding on `Email.embedding` so the next RAG pass can reuse it without re-embedding 25 messages.
10. On error, set `aiStatus=FAILED` and continue processing next tasks.

Intent embedding flow:
1. Load intent row from Supabase.
2. Build embedding from the intent text (`Intent.query` + optional deadline).
3. Persist embedding back to `Intent.embedding` (`vector(384)`).

## `actions` JSON (recommended shape)

`Email.actions` is stored as Postgres/Prisma `Json`. The backend currently guarantees only that `actions` is a **JSON array** (if the model returns a non-array, it is normalized to `[]`).

To keep the Next.js UI stable, treat the following as the **recommended** action item shape:

```json
[
  {
    "title": "Send revised proposal to Alex",
    "due": "2026-04-30",
    "assignee": "me",
    "confidence": 0.72
  }
]
```

- `title` (string, required): a short task name
- `due` (string | null, optional): ideally `YYYY-MM-DD`
- `assignee` (string | null, optional): `"me"`, a person name, or an email
- `confidence` (number 0..1, optional): model confidence for this extracted task

## Environment variables

See [`.env.example`](.env.example). Required for full processing:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INTERNAL_AI_SECRET` (required for webhook endpoints only)

### Pluggable LLM providers (source of truth)

The backend selects a provider using `LLM_PROVIDER` and a small set of shared knobs (`LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`). Provider-specific env vars are supported as **aliases** for convenience and compatibility.

- **Common**
  - `LLM_PROVIDER`: `groq` (default), `ollama`, `openai_compatible`
  - `LLM_MODEL`: model name (optional for `groq`/`ollama`; required for `openai_compatible`)
  - `LLM_BASE_URL`: base URL (optional; used by `ollama` and `openai_compatible`)
  - `LLM_API_KEY`: API key (optional; required for `groq` and `openai_compatible`)

- **Groq** (`LLM_PROVIDER=groq`)
  - Required: `GROQ_API_KEY` (or `LLM_API_KEY`)
  - Optional: `LLM_MODEL` (defaults to `GROQ_MODEL`, which defaults to `llama-3.1-8b-instant`)

- **Ollama** (`LLM_PROVIDER=ollama`)
  - Optional: `OLLAMA_BASE_URL` (or `LLM_BASE_URL`; defaults to `http://localhost:11434`)
  - Optional: `LLM_MODEL` (defaults to `gemma2:2b`)

- **OpenAI-compatible** (`LLM_PROVIDER=openai_compatible`)
  - Required: `LLM_BASE_URL` (or `OPENAI_BASE_URL`)
  - Required: `LLM_API_KEY` (or `OPENAI_API_KEY`)
  - Required: `LLM_MODEL`

Useful runtime controls:
- `QUEUE_MAXSIZE` (default `1000`)
- `ANALYSIS_REQUEST_POLL_INTERVAL_SEC` (default `2.0`) — how often to poll `EmailAnalysisRequest`
- `ANALYSIS_REQUEST_BATCH_SIZE` (default `25`) — how many requests to claim per poll
- `ANALYSIS_ALL_UNANALYZED_LIMIT` (default `200`) — max emails enqueued per bulk request
- `QUEUE_BACKPRESSURE_HIGH_WATERMARK` (default `800`) — pause claiming when queue is high
- `EMBEDDING_MODEL_NAME` (default `all-MiniLM-L6-v2`)
- `INTENT_MATCH_LIMIT` (default `5` — can be **overridden per user** in `User.aiPreferences.intentMatchLimit`)
- `GROQ_MODEL` (default `llama-3.1-8b-instant`)
- `ENABLE_WORKER` (default `true`; can be disabled for tests)
- `WEB_GROUNDING_ENABLED` (default `false`) — when enabled, the classifier may fetch **limited public web snippets** using a privacy-minimized query (sender domain + subject).
- `TAVILY_API_KEY` — required when `WEB_GROUNDING_ENABLED=true`.
- `RAG_DEBUG_LOGS` (default `false`) — when `true`, logs extra structured fields (grounding top-k, web-grounding query, final prompt slice lengths) to help debug retrieval and context size. May log a **short** `policy_fingerprint` when user classification settings apply. Does not log full email bodies or full policy text by default in these lines.

**Database note:** the `Email` table includes optional `embedding` `vector(384)` (Prisma: `Unsupported("vector(384)")?`). Apply migrations so this column exists; see [`../docs/data-and-sync.md`](../docs/data-and-sync.md) for migration order.

## Offline evaluation

The backend includes a minimal offline eval harness in [`evals/`](evals/).

From `backend/`:

```bash
uv run python -m evals.run_eval
```

## Testing

```bash
cd backend
uv run pytest -q
```

Current tests cover:
- health endpoint
- webhook auth + enqueue behavior
- intent ranking determinism
- Groq output normalization
- user preference sanitization and prompt wiring (`<user_preferences>`)
- worker resilience after task failures

## Notes

- Zero-retention scrubbing is currently disabled by design until a `User.zeroRetention` field exists in schema. Storing a long `classificationPolicy` on `User` increases what is persisted in Postgres; keep env and DB access controls strict.
- Keep backend secrets only in backend runtime env, never in `NEXT_PUBLIC_*` variables.
