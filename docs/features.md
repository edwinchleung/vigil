# Vigil features

This guide describes what Vigil does from a **user and product** perspective. You do not need the repository cloned to follow along — routes and UI labels match the live app.

## Authentication

Sign in at `/signin` with **Google** and/or **Microsoft** (work or personal accounts, depending on your Entra app configuration).

- One Vigil user can link **both** providers; each appears as a separate connected account on the dashboard.
- You can use Vigil with **only Google**, **only Microsoft**, or **both** — sync and inbox only touch linked providers.
- Sessions are persistent (database-backed); protected routes under `/dashboard` require sign-in.

## Dashboard

After sign-in, `/dashboard` shows your connected accounts and navigation to:

| Route | Purpose |
| --- | --- |
| `/dashboard/inbox` | Global inbox — sync, search, filters, AI results |
| `/dashboard/intents` | Context Engine — manage active intents |
| `/dashboard/settings` | Profile, Telegram ID, classification preferences |

## Global inbox

The inbox is Vigil's main workspace. It shows up to the **200 most recent** messages stored for your account (not an unlimited live view of every message in Gmail or Outlook).

### Syncing mail

Use **Sync inbox** (with **Sync options**) to pull mail from linked providers:

- **Providers** — Google, Microsoft, or both (only linked accounts are available).
- **Date range** — Limit how far back each sync run looks.
- **Mode** — Refetch recent mail or backfill messages missing full payload in the cache.
- **Batch size** — **40** or **100** messages per provider per batch (default **40**).

When more messages remain, the UI offers **Sync next batch**. **Auto sync** runs batches until finished or you press **Stop**.

Synced messages are **deduplicated** in the database: the same message from the same provider updates in place instead of creating duplicates.

### Search and filters

- **Search** filters the messages **already loaded** on the page. It does not query Gmail, Outlook, or the database again.
- **Tri-tier filter** — **All**, **Critical**, **Relevant**, **Low-Value** — filters by AI-assigned category. Mail not yet classified appears under **All** only.

### What you see on each message

When the Context Engine has processed a message, the row can show:

- **Vigil score** — Numeric priority signal (higher = more attention-worthy in context).
- **Category** — Critical, Relevant, or Low-Value.
- **Summary** — Short plain-language recap.
- **Actions** — Extracted tasks (e.g. "Send revised proposal by Friday") when the model found them.

While analysis runs, the row shows a **processing** state (spinner). Failed analysis is marked accordingly; you can retry via **Analyze** controls when the backend is running.

### Analyze controls

From the inbox you can:

- **Analyze this email** — Queue a single message for AI classification.
- **Analyze all not analyzed** — Queue all messages that have not completed analysis.

These write to a secure analysis queue; the FastAPI worker picks them up. They do not call the AI API directly from the browser.

### Realtime updates (optional)

If your deployment sets Supabase Realtime env vars, **updates** to messages you already have loaded (e.g. new Vigil score after analysis) can appear **without refreshing the page**. New messages from sync still appear after sync completes or the page reloads.

## Intents (Context Engine)

**Intents** are natural-language statements of what you care about right now — for example:

- "Close the Series A term sheet before June 15"
- "Anything from the board about the product launch"
- "Invoices over $5k that need approval"

At `/dashboard/intents` you can:

- **Create** an intent with optional **deadline**
- **Toggle active** — inactive intents are ignored during classification
- **Edit** or **delete** intents

The AI backend embeds intent text and matches incoming mail against active intents when scoring and categorizing. Intents are private to your account and are not exposed via the public Supabase browser API.

## Settings

At `/dashboard/settings`:

### Telegram chat ID

Store a **Telegram chat ID** for future **bypass alerts** (high-priority notifications). Alert delivery is on the [product roadmap](../product-development-plan.md); the field is ready for when that ships.

### Classification policy

Free-text instructions that are injected into the classifier — for example how you define "Critical", domains you always care about, or senders to deprioritize. This is your personal triage rubric in plain language.

### AI preferences (advanced)

Optional numeric overrides for how aggressively the engine uses similar past mail and intent matching (grounding similarity floor, example limits, intent match limit). Defaults work for most users; tweak if you want stricter or looser context.

## AI pipeline (what users experience)

You do not need to configure webhooks to use analysis from the UI. In typical use:

1. You sync mail → messages start as **pending** analysis.
2. You click **Analyze** (or a webhook/automation enqueues work).
3. The row shows **processing**, then **completed** with score, category, summary, and optional actions.
4. Categories drive the **Critical / Relevant / Low-Value** filters.

Behind the scenes, the engine:

- Reads the message body extracted from the synced provider payload
- Compares against your **active intents** and optional **similar past classified mail**
- Optionally adds **public web snippets** (when enabled by operators) for extra context — never treated as the email itself
- Applies your **classification policy** if set

Technical details (webhooks, HMAC auth, embedding model, LLM providers) live in [backend/README.md](../backend/README.md).

## Limits to be aware of

| Topic | Behavior |
| --- | --- |
| Inbox load | Up to **200** newest cached messages on initial page load |
| Search | Only within those loaded rows |
| Sync batch | **40** or **100** messages per provider per batch |
| Sync rate | Roughly **one sync start per 60 seconds** per user (configurable by operators) |
| Partial providers | Only linked Google/Microsoft accounts are synced |
| Unclassified mail | Visible under **All**; tier filters hide it until categorized |

More implementation detail: [data-and-sync.md](data-and-sync.md).

## For implementers

- **Architecture and flows** — [architecture.md](architecture.md)
- **Schema, sync, Realtime, RLS** — [data-and-sync.md](data-and-sync.md)
- **Local setup and OAuth** — [getting-started.md](getting-started.md)
- **Scripts, tests, CI** — [development.md](development.md)
