// Vitest setup: build the app's real schema in each test file's isolated D1.
//
// d1-eloquent migrations are TS files (`up(schema)` using the Schema builder),
// NOT wrangler `.sql` migrations, so the pool's readD1Migrations/applyD1Migrations
// can't apply them. Instead we import every migration, run its `up()` against a
// fresh Schema, and execute the compiled DDL statements through the D1 binding —
// the same statements the CLI runs, minus the wrangler shell-out.
import { env } from "cloudflare:test";
import { beforeAll } from "vitest";
import { Schema } from "@orphnet/d1-eloquent/cli";
import type { TMigration } from "@orphnet/d1-eloquent/cli";

// `import.meta.glob` is a Vite/vitest build macro — it must be called directly
// with a literal pattern (aliasing it breaks the static transform). It's typed via
// the ImportMeta augmentation in test-env.d.ts.
const migrationModules = import.meta.glob<{ default: TMigration }>("../database/migrations/*.ts", {
  eager: true,
});

beforeAll(async () => {
  const migrations = Object.keys(migrationModules)
    .sort()
    .map((k) => migrationModules[k]!.default);

  for (const migration of migrations) {
    const schema = new Schema();
    await migration.up(schema);
    for (const stmt of schema.toStatements()) {
      await env.DB.prepare(stmt).run();
    }
  }
});
