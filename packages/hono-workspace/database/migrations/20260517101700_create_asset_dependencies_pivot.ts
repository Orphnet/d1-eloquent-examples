import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517101700_create_asset_dependencies_pivot",
    description:
        "Self-referential dependency graph between release assets. Every FK form the schema " +
        "builder supports is exercised here:\n" +
        "  1. column-level references(table, column) — single column\n" +
        "  2. table-level foreign('a, b', { references, on: 'c, d' }) — comma-separated string\n" +
        "  3. table-level foreign('a, b', { references, on: ['c', 'd'] }) — string[] form\n" +
        "Both composite FKs point at release_assets' (project_id, version) composite PK.",

    up: (schema: Schema) => {
        schema.createTable("asset_dependencies", (t) => {
            t.id();

            // The "dependent" side — composite columns referencing release_assets.
            t.text("dependent_project_id").notNull();
            t.text("dependent_version").notNull();

            // The "requires" side — composite columns referencing release_assets.
            t.text("requires_project_id").notNull();
            t.text("requires_version").notNull();

            // A single-column FK declared the column-level way (form 1).
            t.text("requested_by").references("users", "id").onDelete("set null");

            t.text("constraint_kind").notNull().default("requires");
            t.timestamps();

            // Form 2 — composite FK with a comma-separated `on` string.
            t.foreign("dependent_project_id, dependent_version", {
                references: "release_assets",
                on: "project_id, version",
                onDelete: "cascade",
            });

            // Form 3 — composite FK with the `on` columns given as a string[].
            t.foreign("requires_project_id, requires_version", {
                references: "release_assets",
                on: ["project_id", "version"],
                onDelete: "restrict",
            });

            t.check("constraint_kind IN ('requires', 'optional', 'conflicts')");
            t.unique(
                "dependent_project_id, dependent_version, requires_project_id, requires_version",
            );
            t.index("requires_project_id, requires_version");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("asset_dependencies");
    },
};

export default migration;
