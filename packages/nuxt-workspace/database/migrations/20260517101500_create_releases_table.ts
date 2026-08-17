import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

/**
 * Project releases — the demo surface for:
 *
 *  - RETURNING (`insertReturning` / `updateReturning` / `deleteReturning`) —
 *    handy here because `sequence` is filled by a generated column and we want
 *    the computed value back in one round-trip.
 *  - batch ops (`createMany` / `insertMany`) and `upsert` with a conflict
 *    target (the `(project_id, version)` unique index).
 *  - D1 Sessions + result metadata via `withSession()` / `getWithMeta()`.
 *
 * `version` is unique per project so re-publishing the same version upserts.
 */
const migration: TMigration = {
    name: "20260517101500_create_releases_table",
    description:
        "Project releases — surface for RETURNING clauses, batch ops, upsert-with-conflict-target, and D1 read sessions / result metadata.",

    up: (schema: Schema) => {
        schema.createTable("releases", (t) => {
            t.id();
            t.text("project_id").notNull().references("projects", "id").onDelete("cascade");
            t.text("version").notNull(); // semver string, e.g. "1.2.0"
            t.text("channel").notNull().default("stable");
            t.text("notes");
            t.integer("downloads").notNull().default(0);
            t.json("artifacts", { validate: true });
            t.text("published_at");
            t.timestamps();

            t.check("channel IN ('stable', 'beta', 'canary')");
            // conflict target for upsert(... ['project_id', 'version'])
            t.unique("project_id, version", "uq_releases_project_version");
            t.index("project_id");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("releases");
    },
};

export default migration;
