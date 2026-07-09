# Bellaworks AI Chat Platform

Multi-tenant AI chat platform: each client gets an isolated knowledge base,
branding, AI settings, analytics, and an embeddable widget, all served from a
single API that owns the OpenAI relationship.

## Repository layout

| Path                  | What it is                                                                          |
| --------------------- | ----------------------------------------------------------------------------------- |
| `apps/api`            | Express + TypeScript API (tenancy, widget endpoints; RAG/chat arrive in Phases 2–3) |
| `apps/dashboard`      | React admin dashboard (Phase 6, placeholder)                                        |
| `packages/shared`     | zod schemas + API types shared across API, widget, dashboard                        |
| `packages/widget`     | Embeddable web-component widget (Phase 4, placeholder)                              |
| `wordpress-plugin`    | Content-sync companion plugin (Phase 5, placeholder)                                |
| `supabase/migrations` | Database migrations (Supabase CLI)                                                  |
| `test-pages`          | Static pages for exercising the API from a real browser                             |

## Local development

Prereqs: Node 22+, pnpm 10, Docker running.

```bash
pnpm install
pnpm build              # builds packages/shared
cp apps/api/.env.example apps/api/.env

pnpm db:start           # local Supabase stack (applies migrations)
pnpm db:role            # grants LOGIN to the RLS-enforced app_api role
pnpm seed               # creates the demo "whitewater" client + API key

pnpm dev                # API on http://localhost:3001
```

Quick check (the Origin header is what domain validation keys off):

```bash
curl -H "Origin: https://whitewater.com" http://localhost:3001/v1/widget/whitewater/config
curl -X POST -H "Origin: https://whitewater.com" http://localhost:3001/v1/widget/whitewater/session
```

Knowledge base (Phase 2) — `pnpm ingest-samples` loads demo content, then:

```bash
curl -X POST http://localhost:3001/v1/knowledge/search \
  -H "Authorization: Bearer bw_sk_..." -H "Content-Type: application/json" \
  -d '{"query": "how do refunds work?"}'
```

Without `OPENAI_API_KEY` in `apps/api/.env`, deterministic offline providers
are used for embeddings and chat (grounded but canned answers); set a key for
real semantic search + GPT responses. Ingestion runs through pg-boss
background jobs — check document `status` via `GET /v1/knowledge/documents`.

Widget (Phase 4) — embed on any allowed domain with two tags:

```html
<script src="http://localhost:3001/widget.js"></script>
<bellaworks-chat client-id="whitewater"></bellaworks-chat>
```

See it live: serve `test-pages/` (`python3 -m http.server 5173 --directory test-pages`)
and open `http://localhost:5173/widget.html`. Theming is CSS variables — site
owners can override any of them: `bellaworks-chat { --bw-primary: #7c3aed; }`.

Or serve `test-pages/` (`python3 -m http.server 5173`) and open
`http://localhost:5173/origin-check.html` for a real-browser test.

## Tests

```bash
pnpm test:unit                              # no database needed (runs in CI)
pnpm --filter @bellaworks/api test:integration   # needs db:start + db:role
```

Integration tests create their own throwaway clients and include an RLS suite
proving cross-tenant reads are impossible even for unfiltered queries.

## Architecture notes (Phase 1)

- **Two credentials per client.** The public slug (`whitewater`) identifies a
  client in the browser and is guarded by the per-client domain allow-list;
  secret `bw_sk_…` keys (stored as SHA-256 hashes) are for server-to-server
  use only (WordPress plugin, dashboard).
- **Widget sessions.** `POST /v1/widget/:slug/session` validates the browser
  `Origin` and mints a 24h HS256 JWT; the chat endpoint (Phase 3) will accept
  only that token.
- **Tenant isolation.** Requests are served through the unprivileged
  `app_api` Postgres role. RLS policies key off transaction-local settings
  (`app.tenant_id`, `app.lookup_slug`) set once per request by
  `withDbContext` — an unscoped query returns nothing rather than other
  tenants' rows.
- **JSONB + zod.** `clients.branding` / `clients.ai_settings` are validated by
  the schemas in `packages/shared`; adding a branding field is a schema change,
  not a migration.
- **RAG pipeline (Phase 2).** Documents are chunked heading-aware (~800-token
  max, gpt-tokenizer counts), hashed at document and chunk level so re-syncs
  embed only what changed, and stored in pgvector (HNSW, cosine). Embeddings
  go through an `EmbeddingsProvider` interface (OpenAI or offline fake).
  Processing runs in pg-boss jobs under the same tenant-scoped RLS context as
  requests.
