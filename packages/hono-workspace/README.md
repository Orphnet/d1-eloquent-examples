# @example/hono-workspace

Hono + Cloudflare Workers example for **@orphnet/d1-eloquent** — a multi-tenant workspace platform demonstrating every major ORM feature on a single coherent domain.

🔗 **Live demo**: [hono-example.d1-eloquent.orph.dev](https://hono-example.d1-eloquent.orph.dev)
🔗 **Sibling Nuxt example** (same data, Nuxt 4 + SSR, no separate API tier): [nuxt-example.d1-eloquent.orph.dev](https://nuxt-example.d1-eloquent.orph.dev)

## What this example demonstrates

| d1-eloquent feature | Where to see it |
|---|---|
| `BaseModel<TAttrs, TVirtuals, TRels>` with typed `.relations` | every model in `src/models/` |
| `belongsTo` / `hasMany` / `hasOne` | `Project → Workspace`, `Project → Tasks`, etc. |
| `belongsToMany` + pivot management (`attach` / `detach` / `sync` / `toggle`) | `Workspace ↔ User` via `workspace_members`; routes in `tags.ts` |
| `morphTo` / `morphMany` / `morphOne` | `Comment.commentable`, `Attachment.attachable`, `ActivityEvent.subject` |
| `morphToMany` / `morphedByMany` | `Task` & `Post` ↔ `Tag` via shared `taggables` pivot |
| Soft deletes (`softDeletes = true`, `t.softDeletes()`) | `Workspace`, `User`, `Project`, `Task`, `Post`, `Comment` |
| Revision tracking + time-travel | `Task` (`diff+after`), `Post` (`before+after`) — see `GET /api/audit/...` |
| `Model.createMany(rows[])` | seeder: bulk user / tag / task / post inserts |
| JSON columns + `static casts = { col: 'json' }` | `Workspace.settings`, `Post.metadata`, `ActivityEvent.payload` |
| JSON `validate: true` (CHECK constraint) | migrations 100000, 100500, 101100 |
| BLOB columns | `Attachment.data` (passed as `ArrayBuffer`, `casts: 'blob'`) |
| FTS5 virtual tables | `posts_search` migration + `GET /api/search?q=...` |
| FTS5 `whereMatch()` + `orderByRank()` | `src/routes/search.ts` |
| Partial indexes via `.where('deleted_at IS NULL')` | `projects` slug, `posts` slug |
| Composite-column indexes | `tasks(project_id, status)`, `activity_events(workspace_id, created_at, id)` |
| `defaultRaw("(datetime('now'))")` | `workspace_members.joined_at`, `taggables.attached_at` |
| `t.timestamps()` | every entity that needs created_at/updated_at |
| `t.check()` constraints | `tasks.status`, `posts.status`, `model_revisions.action`, `attachments.size_bytes` |
| Cursor pagination (`paginateCursor`) | `GET /api/feed`, `GET /api/workspaces/:slug/posts` |
| Relation aggregates (`withCount`, `withSum`, `withAvg`) | `GET /api/workspaces/:slug`, `/projects`, `/posts` |
| Eager loading (`.with([...])`) — incl. polymorphic morphTo batching | almost every list endpoint |
| Scopes (`static scopes`) | `Workspace.active`, `Task.open`, `Post.published`, etc. |
| Lifecycle hooks | `Task` auto-stamps `completed_at` when status flips to `done` |
| KV cache (`KvCacheAdapter`) | wired in `src/lib/cache.ts`, used in `workspaces.ts` |
| Multi-DB-ready config | `configure(c.env)` in `src/index.ts` |

## Quick start

From the **workspace root** (`/d1-eloquent-examples/`):

```bash
bun install
bun run dev          # wrangler dev on :8787
```

Or from this package directly:

```bash
cd packages/hono-workspace
bun run dev
```

### Local database setup

The first time you run, you'll need a local D1 binding. Either:

1. **Use Miniflare's auto-binding** (default for `wrangler dev`) — D1 is provisioned locally with no extra config.
2. **Or create a real D1 database** and update `wrangler.jsonc`:
   ```bash
   bunx wrangler d1 create d1-eloquent-example-hono
   # Copy the `database_id` into wrangler.jsonc
   ```

Then run the schema + seed:

```bash
bun run db:migrate     # applies all migrations (incl. the showcase_* tables)
bun run db:seed        # populates with realistic fake data
# or all at once:
bun run db:fresh && bun run db:seed
```

### Sample requests

```bash
# Root manifest with route index
curl http://localhost:8787

# List workspaces
curl http://localhost:8787/api/workspaces

# Acme workspace with counts and members
curl http://localhost:8787/api/workspaces/acme

# Cursor-paginated post feed
curl "http://localhost:8787/api/workspaces/acme/posts?perPage=5"

# Cursor-paginated activity feed
curl "http://localhost:8787/api/feed?workspace=acme&perPage=10"

# FTS5 search
curl "http://localhost:8787/api/search?q=migration"

# Create a task — note revision tracking kicks in
curl -X POST http://localhost:8787/api/workspaces/acme/tasks \
  -H "content-type: application/json" \
  -d '{"project_id":"<some-id>","title":"Demo task","priority":2}'

# Revision history
curl http://localhost:8787/api/audit/tasks/<task-id>
```

## Endpoint reference

| Method | Path | Notes |
|---|---|---|
| GET | `/` | API manifest |
| GET | `/ready` | health probe |
| GET | `/api/workspaces` | list (KV cached 60s) |
| POST | `/api/workspaces` | create + optional owner |
| GET | `/api/workspaces/:slug` | workspace + member/project/post counts |
| GET | `/api/workspaces/:slug/projects` | list with task counts |
| POST | `/api/workspaces/:slug/projects` | create |
| GET | `/api/workspaces/:slug/tasks` | filterable list with assignee + tags |
| POST | `/api/workspaces/:slug/tasks` | create + activity event + revision |
| PATCH | `/api/workspaces/:slug/tasks/:id` | partial update + revision |
| DELETE | `/api/workspaces/:slug/tasks/:id` | soft-delete + revision |
| GET | `/api/workspaces/:slug/tasks/:id/asof/:isoTimestamp` | time-travel |
| GET | `/api/workspaces/:slug/posts` | cursor-paginated published posts |
| POST | `/api/workspaces/:slug/posts` | create draft |
| GET | `/api/workspaces/:slug/posts/:postSlug` | single post + view-count bump |
| POST | `/api/workspaces/:slug/posts/:postSlug/publish` | publish + activity event |
| POST | `/api/workspaces/:slug/tasks/:id/comments` | morphMany on Task |
| POST | `/api/workspaces/:slug/posts/:id/comments` | morphMany on Post |
| GET | `/api/tags` | optional `?workspace_id=` filter |
| POST | `/api/tags/:id/attach` | pivot attach |
| POST | `/api/tags/:id/detach` | pivot detach |
| POST | `/api/tags/sync` | pivot sync (full replace) |
| POST | `/api/attachments` | BLOB upload (raw body + headers) |
| GET | `/api/attachments/:id/download` | streams BLOB |
| GET | `/api/search?q=` | FTS5 search across posts |
| GET | `/api/feed?workspace=` | cursor-paginated activity feed |
| GET | `/api/audit/:type/:id` | revision history (type ∈ task,post) |
| GET | `/api/audit/tasks/:id/asof/:ts` | time-travel |

## beta.3 feature showcase — `GET /api/features`

The 14 features added in **beta.3** each have a **runnable** endpoint under `/api/features`.
Every endpoint seeds its own isolated fixtures (a dedicated `showcase` workspace with
`sw_`-prefixed ids, or dedicated `showcase_*` tables), runs the feature **live** against D1,
and returns `{ feature, whatItShows, snippet, result }` — so the response doubles as
copy-paste documentation. Endpoints are self-contained and never touch your seeded demo data.

```bash
# Index of every feature endpoint
curl http://localhost:8787/api/features

# Run any feature and see the live result + the exact d1-eloquent call
curl http://localhost:8787/api/features/counters
curl http://localhost:8787/api/features/transaction-counters
```

| # | Feature | Endpoint |
|---|---|---|
| 1 | `increment()` / `decrement()` (QueryBuilder + instance, extra cols, NULL→0) | `GET /api/features/counters` |
| 2 | `whereRelation()` / `orWhereRelation()` / `firstWhere()` | `GET /api/features/where-relation` |
| 3 | `replicate()` + `wasRecentlyCreated` | `GET /api/features/replicate` |
| 4 | constrained eager loading — `.with({ rel: q => q… })` | `GET /api/features/constrained-eager` |
| 5 | `enumCast()` (+ the `onInvalidRead: 'null'` opt-in) | `GET /api/features/enum-cast` |
| 6 | `withMin()` / `withMax()` / `withExists()` | `GET /api/features/relation-aggregates` |
| 7 | `intersect()` / `except()` (soft-delete scoped) | `GET /api/features/set-operators` |
| 8 | `whereDate` / `whereTime` / `whereYear` / `whereMonth` / `whereDay` | `GET /api/features/date-parts` |
| 9 | global scopes + `withoutGlobalScope(s)` | `GET /api/features/global-scopes` |
| 10 | `hasManyThrough` / `hasOneThrough` | `GET /api/features/through-relations` |
| 11 | `prepare()` + `placeholder()` | `GET /api/features/prepared-queries` |
| 12 | schema-diff `generate` CLI | _docs — see below (`bun run db:generate`)_ |
| 13 | `transaction()` — atomic unit-of-work | `GET /api/features/transactions` |
| 14 | `tx.increment()` / `tx.decrement()` | `GET /api/features/transaction-counters` |

The endpoints are exercised by `src/features-showcase.integration.test.ts` (drives the real
Hono app via `app.fetch`), alongside `src/features.integration.test.ts` (the direct-ORM
reference the endpoints were lifted from).

### Schema-diff migrations — `bun run db:generate` (feature 12)

Feature 12 is a **build-time CLI**, not an HTTP route. `d1-eloquent generate` compares the
columns declared on your models against the schema reconstructed from your migration history,
and emits an **ALTER migration** for the drift — the counterpart to the blank
`bun run db:make:migration` scaffolder.

This repo ships a committed example of the command's output:

1. `src/models/showcase.ts`'s `ShowcaseDoc` declares a `tags` column.
2. The create-table migration `…101800_create_showcase_docs_table.ts` does **not** have it — so the model had drifted ahead of the schema.
3. `bun run db:generate` was run against that drift and emitted
   `database/migrations/…102400_alter_showcase_docs_add_tags.ts` (committed here verbatim),
   which is what closes the drift:

   ```ts
   // Auto-generated by `d1-eloquent generate`. Review before running `migrate`.
   const migration: TMigration = {
     name: "20260517102400_alter_showcase_docs_add_tags",
     up: (schema: Schema) => {
       schema.table("showcase_docs", (t) => {
         t.addText("tags");
       });
     },
     down: (schema: Schema) => {
       schema.table("showcase_docs", (t) => {
         t.dropColumn("tags");
       });
     },
   };
   export default migration;
   ```

4. `bun run db:migrate` then applies it (the create-table + this ALTER together give
   `showcase_docs` its `tags` column).

To watch `generate` work yourself, introduce fresh drift — add another column to a model
(e.g. `color?: string | null` on `ShowcaseDoc`) and run:

```bash
bun run db:generate    # d1-eloquent generate — writes the ALTER migration for the new model↔schema drift
bun run db:migrate     # apply it
```

Contrast with `bun run db:make:migration`, which scaffolds an **empty** migration for you to
fill in by hand.

## Deploy

1. Provision a real D1: `bunx wrangler d1 create d1-eloquent-example-hono` — copy the `database_id` into `wrangler.jsonc`.
2. Provision a KV namespace: `bunx wrangler kv:namespace create CACHE` — copy the `id` into `wrangler.jsonc`.
3. Apply migrations against remote: `bunx d1-eloquent migrate --remote`.
4. Deploy: `bun run deploy` (or `bunx wrangler deploy`).

## Tests

```bash
bun run test
```

Uses `@cloudflare/vitest-pool-workers` against the local D1 binding.
