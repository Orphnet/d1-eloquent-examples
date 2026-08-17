import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517101300_create_workspace_settings_table",
    description:
        "JSON-heavy per-workspace preferences. One row per workspace; the `prefs` JSON " +
        "blob is exercised by the JSON query/update helpers, accessors, mutators, and appends.",

    up: (schema: Schema) => {
        schema.createTable("workspace_settings", (t) => {
            t.id();
            // FK declared the classic single-column way (references(table, column)).
            t.text("workspace_id").notNull().unique().references("workspaces", "id").onDelete("cascade");
            // The star of the JSON-helper demos. `validate: true` adds
            // CHECK (json_valid(prefs) OR prefs IS NULL).
            t.json("prefs", { validate: true });
            // A JSON *array* column (cast: 'array') for whereJsonContains / whereJsonLength.
            t.json("feature_flags", { validate: true }).defaultRaw("(json('[]'))");
            // A secret webhook signing key — hidden from default JSON serialization.
            t.text("webhook_secret");
            // A free-form theme string surfaced through a mutator (lower-cased on write)
            // and an accessor-backed `theme_label` append.
            t.text("theme").notNull().default("system");
            t.timestamps();

            t.check("theme IN ('system', 'light', 'dark')");
            t.index("workspace_id");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("workspace_settings");
    },
};

export default migration;
