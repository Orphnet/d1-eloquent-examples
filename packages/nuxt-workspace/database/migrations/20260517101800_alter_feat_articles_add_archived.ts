import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

/**
 * ── FEATURE 12: schema-diff generate CLI (`d1-eloquent generate`) ────────────
 *
 * This file is a *sample of what `bun run db:generate` emits*. The showcase
 * model `server/models/showcase/FeatArticle.ts` declares an `archived` boolean
 * column (with an `archived: "boolean"` cast) that the original
 * `..._create_feature_showcase_tables` migration did NOT create - i.e. the
 * model drifted ahead of the schema.
 *
 * Running:
 *
 *     bun run db:generate      # d1-eloquent generate
 *
 * reconstructs the declared columns from the model, diffs them against the
 * columns the migration history builds, detects the missing `archived` column,
 * and writes an ADD COLUMN migration exactly like the one below. You then apply
 * it with the normal:
 *
 *     bun run db:migrate
 *
 * Contrast with `bun run db:make:migration`, which scaffolds an EMPTY migration
 * for you to hand-author - `generate` fills the body from the model↔schema diff.
 */
const migration: TMigration = {
    name: "20260517101800_alter_feat_articles_add_archived",
    description: "[generated] ADD COLUMN feat_articles.archived - model declared it; schema lacked it.",

    up: (schema: Schema) => {
        schema.table("feat_articles", (t) => {
            t.addBoolean("archived", { nullable: false, default: false });
        });
    },

    down: (schema: Schema) => {
        schema.table("feat_articles", (t) => {
            t.dropColumn("archived");
        });
    },
};

export default migration;
