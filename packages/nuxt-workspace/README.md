# @example/nuxt-workspace

Nuxt 4 + Nitro on Cloudflare example for **@orphnet/d1-eloquent** — a multi-tenant workspace platform where Nitro server routes hit D1 directly. **No separate API tier.**

🔗 **Live demo**: [nuxt-example.d1-eloquent.orph.dev](https://nuxt-example.d1-eloquent.orph.dev)
🔗 **Sibling Hono example** (same domain model, REST-only): [hono-example.d1-eloquent.orph.dev](https://hono-example.d1-eloquent.orph.dev)

## What this example demonstrates

Everything the Hono example does, plus:

| Topic | Where to see it |
|---|---|
| `configure(env)` from Nitro `event.context.cloudflare.env` | `server/utils/db.ts` |
| Server-side D1 reads in SSR HTML | `app/pages/index.vue` uses `useFetch()` against `/api/*`, which runs in the same Worker |
| Identical curl recipes vs the Hono example | every `server/api/**` route mirrors `packages/hono-workspace/src/routes/*` one-for-one |
| Cloudflare Worker assets binding for static files | `wrangler.jsonc` `assets` block |
| Worker-mode Nitro preset (`cloudflare_module`) — same runtime as the Hono app | `nuxt.config.ts` |

The shared workspace domain (`workspace → projects → tasks`, blog `posts`, polymorphic `comments`, polymorphic `tags`, polymorphic `activity_events`, polymorphic `attachments`, revision tracking, time-travel, FTS5, cursor pagination, KV cache) is documented exhaustively in the [Hono example's README](../hono-workspace/README.md).

## Beta.3 feature showcase

The [`/features`](https://nuxt-example.d1-eloquent.orph.dev/features) page runs all **14 beta.3 features** live against D1, one card each — *what it proves*, the *copyable d1-eloquent call*, and the *real result* computed that request.

| # | Feature | Endpoint key |
|---|---|---|
| 1 | `increment()` / `decrement()` (query-builder + instance, COALESCE NULL→0) | `increment-decrement` |
| 2 | `whereRelation()` / `orWhereRelation()` + `firstWhere()` | `where-relation-first-where` |
| 3 | `replicate()` + `wasRecentlyCreated` | `replicate-was-recently-created` |
| 4 | Constrained eager loading — `.with({ rel: q => q… })` | `constrained-eager-loading` |
| 5 | `enumCast()` (incl. `onInvalidRead: 'null'` opt-in) | `enum-cast` |
| 6 | `withMin()` / `withMax()` / `withExists()` | `with-min-max-exists` |
| 7 | `intersect()` / `except()` (soft-delete scoped) | `intersect-except` |
| 8 | Date-part wheres — `whereDate/Time/Year/Month/Day` | `date-part-where` |
| 9 | Global scopes + `withoutGlobalScope(s)` | `global-scopes` |
| 10 | `hasManyThrough` / `hasOneThrough` | `has-many-through` |
| 11 | Prepared queries — `prepare()` + `placeholder()` | `prepared-queries` |
| 12 | Schema-diff generate CLI (`d1-eloquent generate`) | `schema-diff-generate` |
| 13 | `transaction()` — atomic unit-of-work | `transactions` |
| 14 | `tx.increment()` / `tx.decrement()` — atomic counters in a tx | `tx-increment-decrement` |

- **All at once:** `GET /api/features` · **one in isolation:** `GET /api/features/:key`
- Server code: `server/utils/showcase/registry.ts` (the 14 loaders, calls lifted verbatim from the Hono example's `features.integration.test.ts`) → `server/api/features/{index,[key]}.get.ts` → `app/pages/features.vue`.
- Dedicated `feat_*` fixture tables (`database/migrations/20260517101700_create_feature_showcase_tables.ts`); each loader reseeds its own rows, so results are deterministic and never touch the `acme` seed.
- **Runtime check:** `bun run db:migrate && bun run features:verify` runs every loader against the local Miniflare D1 and asserts the exact expected result (69 assertions across the 14 features) — the Nuxt analogue of the Hono example's integration test.

### Feature 12 — schema-diff migrations (`d1-eloquent generate`)

`d1-eloquent generate` is a **build-time** command (not an HTTP route). It reconstructs each model's declared columns, diffs them against what the migration history builds, and emits an `ADD`/`DROP COLUMN` migration for the drift — unlike `db:make:migration`, which scaffolds an *empty* migration you fill in by hand.

This repo ships a worked example:

1. `server/models/showcase/FeatArticle.ts` declares an `archived` boolean column (`archived: "boolean"` cast) that the create-table migration did **not** create — the model drifted ahead of the schema.
2. Running `bun run db:generate` detects the missing column and writes an ADD COLUMN migration — the committed sample is `database/migrations/20260517101800_alter_feat_articles_add_archived.ts`.
3. `bun run db:migrate` applies it; `GET /api/features/schema-diff-generate` then confirms the `archived` column is queryable and cast to boolean.

```bash
bun run db:generate    # d1-eloquent generate → writes the ADD COLUMN migration for the drift
bun run db:migrate     # apply it
```

## Quick start

From the **workspace root** (`/d1-eloquent-examples/`):

```bash
bun install
cd packages/nuxt-workspace

bun run db:migrate    # local Miniflare D1
bun run dev           # nuxt dev → http://localhost:3000

# In another shell, seed the local DB:
curl -X POST http://localhost:3000/api/admin/seed?fresh=1
```

Then open <http://localhost:3000/> for the SSR workspace view, or hit `/api` for the endpoint manifest.

## Deploy

```bash
bun run build                                 # nuxt build → .output/
cd .output && bunx wrangler deploy            # Worker + custom domain attach

# Apply migrations to remote D1 (one-time per database):
cd .. && bunx d1-eloquent migrate --remote

# Seed the remote DB:
curl -X POST https://<your-domain>/api/admin/seed?fresh=1
```

`wrangler.jsonc` carries the `custom_domain: true` route for `nuxt-example.d1-eloquent.orph.dev` so no manual DNS work is required when the zone is on the same Cloudflare account.

## Architecture notes

- **No separate API tier.** Nitro server routes call `@orphnet/d1-eloquent` Model classes directly. The same Model code that the Hono example uses works unchanged here.
- **Idempotent `configure(env)`.** `server/utils/db.ts` wires the D1 binding into d1-eloquent's connection registry on the first request and reuses it thereafter.
- **Migrations and models are shared by convention.** They were copied from the Hono example so both apps speak the same schema; in a real project you'd hoist them to a `packages/shared` package.
- **SSR + client hydration.** The index page server-side renders all data; client navigation to `/posts/:slug` does a client-side `useFetch` (no full reload).
