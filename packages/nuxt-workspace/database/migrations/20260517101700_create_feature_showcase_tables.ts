import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

/**
 * Dedicated tables for the beta.3 **feature showcase** (`/features` page +
 * `server/api/features/*`). Kept separate from the domain schema (`feat_`
 * prefix) so the showcase loaders can reset + reseed their own fixtures on
 * every call - deterministic results that never touch the demo's `acme` data.
 *
 * Which feature each table backs:
 *   feat_counters   → 1  increment / decrement (QueryBuilder + instance, COALESCE NULL→0)
 *   feat_teams      → 2  whereRelation / firstWhere · 4 constrained eager · 6 withMin/Max/Exists
 *   feat_members    → (child of feat_teams; also 11 prepared queries)
 *   feat_articles   → 3  replicate / wasRecentlyCreated · 7 intersect/except · 8 date-part wheres
 *   feat_enum_docs  → 5  enumCast (incl. onInvalidRead)
 *   feat_scoped_docs→ 9  global scopes + withoutGlobalScope(s)
 *   feat_countries  → 10 hasManyThrough / hasOneThrough (Country → Citizen → Story)
 *   feat_citizens   → (through table for feature 10)
 *   feat_stories    → (final table for feature 10)
 *   feat_accounts   → 13 transactions · 14 tx.increment / tx.decrement
 */
const migration: TMigration = {
    name: "20260517101700_create_feature_showcase_tables",
    description: "Dedicated feat_* tables backing the beta.3 feature showcase (/features).",

    up: (schema: Schema) => {
        // 1 - increment / decrement. `hits` is nullable to prove COALESCE(NULL,0).
        schema.createTable("feat_counters", (t) => {
            t.id();
            t.text("label").notNull();
            t.integer("views").notNull().default(0);
            t.integer("hits"); // nullable → COALESCE demo
        });

        // 2 / 4 / 6 / 11 - a parent (team) with children (members).
        schema.createTable("feat_teams", (t) => {
            t.id();
            t.text("name").notNull();
        });
        schema.createTable("feat_members", (t) => {
            t.id();
            t.text("team_id").notNull().references("feat_teams", "id").onDelete("cascade");
            t.text("name").notNull();
            t.text("role").notNull();
            t.integer("seniority").notNull().default(0);
            t.index("team_id");
        });

        // 3 / 7 / 8 - soft-deletable articles with a timestamp column.
        schema.createTable("feat_articles", (t) => {
            t.id();
            t.text("title").notNull();
            t.text("slug").notNull();
            t.text("status").notNull().default("draft");
            t.integer("views").notNull().default(0);
            t.text("published_at"); // nullable datetime string, used by date-part wheres
            t.softDeletes();
            t.timestamps();
        });

        // 5 - enum cast. Bare columns; enumCast validates on write.
        schema.createTable("feat_enum_docs", (t) => {
            t.id();
            t.text("status");
            t.integer("level");
        });

        // 9 - global (tenant) scope.
        schema.createTable("feat_scoped_docs", (t) => {
            t.id();
            t.text("tenant").notNull();
            t.text("title").notNull();
        });

        // 10 - hasManyThrough / hasOneThrough: Country → Citizen → Story.
        schema.createTable("feat_countries", (t) => {
            t.id();
            t.text("name").notNull();
        });
        schema.createTable("feat_citizens", (t) => {
            t.id();
            t.text("country_id").notNull().references("feat_countries", "id").onDelete("cascade");
            t.text("name").notNull();
            t.index("country_id");
        });
        schema.createTable("feat_stories", (t) => {
            t.id();
            t.text("citizen_id").notNull().references("feat_citizens", "id").onDelete("cascade");
            t.text("title").notNull();
            t.index("citizen_id");
        });

        // 13 / 14 - transactional balances / atomic counters.
        schema.createTable("feat_accounts", (t) => {
            t.id();
            t.text("name").notNull();
            t.integer("balance").notNull().default(0);
        });
    },

    down: (schema: Schema) => {
        for (const table of [
            "feat_accounts",
            "feat_stories",
            "feat_citizens",
            "feat_countries",
            "feat_scoped_docs",
            "feat_enum_docs",
            "feat_articles",
            "feat_members",
            "feat_teams",
            "feat_counters",
        ]) {
            schema.dropTable(table);
        }
    },
};

export default migration;
