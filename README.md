# @orphnet/d1-eloquent-examples

Reference examples for [**@orphnet/d1-eloquent**](https://github.com/orphnet/d1-eloquent) — the type-safe Eloquent-style ORM for Cloudflare D1.

This repo demonstrates every major d1-eloquent feature on a single, coherent domain so you can see how the pieces fit together in a real Workers project.

## The shared example

A **multi-tenant workspace platform** — each workspace contains:

- **Projects** with **Tasks** (self-referencing for subtasks)
- A **Blog** with **Posts** (Markdown body, FTS5-searchable)
- **Users** (workspace members via pivot)
- **Comments** (polymorphic on Tasks AND Posts)
- **Tags** (polymorphic many-to-many across Tasks AND Posts)
- **Attachments** (BLOB, polymorphic on Tasks AND Posts)
- **Activity** events (polymorphic + JSON payload, cursor-paginated feed)

Demonstrates: every relation type, soft deletes, revision tracking with time-travel, JSON columns, BLOB columns, FTS5, CTEs, cursor pagination, KV cache, multi-DB-ready config, typed relations, identifier safety, RETURNING clauses, relation aggregates, pivot management — the lot.

## Packages

| Package | Status | What it demonstrates |
|---|---|---|
| [`packages/hono-workspace`](./packages/hono-workspace) | **✅ Live** → [hono-example.d1-eloquent.orph.dev](https://hono-example.d1-eloquent.orph.dev) | Hono on Cloudflare Workers — REST API, generic JSON responses, comprehensive d1-eloquent coverage. |
| [`packages/nuxt-workspace`](./packages/nuxt-workspace) | **✅ Live** → [nuxt-example.d1-eloquent.orph.dev](https://nuxt-example.d1-eloquent.orph.dev) | Nuxt 4 on Cloudflare. Nitro server routes hit D1 directly via `@orphnet/d1-eloquent` — **no separate API tier**. Same domain model + same migrations as the Hono example. |

Both examples share the same migrations and model classes; only the HTTP transport differs. The same `curl` recipes against either deployment return identical JSON shapes.

> **Note**: Go is intentionally not represented — d1-eloquent is TypeScript-only. For Go consumers, hit the Hono example's REST API over HTTP.

## Quick start

```bash
# Install deps for the whole workspace
bun install

# Start the Hono example (REST API on :8787)
cd packages/hono-workspace
bun run db:migrate && bun run dev

# OR, in another shell, start the Nuxt example (SSR + API on :3000)
cd packages/nuxt-workspace
bun run db:migrate && bun run dev
```

Either app boots empty — the first request to its admin seed endpoint populates the demo workspace:

```bash
# Hono
curl -X POST http://localhost:8787/admin/seed?fresh=1
# Nuxt
curl -X POST http://localhost:3000/api/admin/seed?fresh=1
```

Endpoints documented in each package's README. Both apps respond at the same URL shapes.

## Database commands

The package's CLI is wired to root-level scripts so you can run them from anywhere in the repo:

```bash
bun run db:migrate     # apply pending migrations
bun run db:fresh       # drop all + re-migrate
bun run db:seed        # populate with realistic fake data
bun run db:status      # show migration state
bun run db:rollback    # rollback the last batch
```

All commands target the local Miniflare D1 by default. Add `-- --remote` to hit your deployed D1.

## Tests

```bash
bun run test
```

## Deploying

```bash
bun run deploy   # wrangler deploy on the hono example
```

You'll need your own Cloudflare account / D1 binding. See the per-package README for setup.

## Structure

```
d1-eloquent-examples/
├── package.json              # workspace root, run scripts
├── README.md                 # this file
└── packages/
    └── hono-workspace/       # Hono + d1-eloquent + KV cache + comprehensive demo
        ├── package.json
        ├── wrangler.jsonc
        ├── tsconfig.json
        ├── vitest.config.ts
        ├── README.md         # endpoint reference + feature checklist
        ├── src/
        │   ├── index.ts      # Hono app entry
        │   ├── routes/       # REST endpoints, one file per resource
        │   ├── models/       # d1-eloquent models
        │   └── seed/         # seeders
        └── database/
            └── migrations/   # one migration per domain entity
```

## License

MIT — see [LICENSE](./LICENSE).

## See also

- **d1-eloquent**: [github.com/orphnet/d1-eloquent](https://github.com/orphnet/d1-eloquent)
- **Skill**: [github.com/Orphnet/d1-eloquent-skill](https://github.com/Orphnet/d1-eloquent-skill) — Claude Code skill for d1-eloquent
- **Docs**: [d1-eloquent.orph.dev](https://d1-eloquent.orph.dev)
