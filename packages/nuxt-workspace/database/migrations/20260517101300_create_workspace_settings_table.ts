import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

/**
 * A JSON-heavy per-workspace settings row. One row per workspace (unique FK).
 *
 * This is the demo surface for the JSON query helpers — `whereJsonPath`,
 * `whereJsonContains`, `whereJsonLength`, `selectJsonExtract`, the JSON
 * aggregates, the in-place JSON updates (`updateJsonSet` / `updateJsonPatch`
 * / `updateJsonRemove`), and full cast coverage (json / array / boolean /
 * integer / real / date / datetime / blob). The `validate: true` flag on the
 * JSON columns adds a `CHECK (json_valid(col) OR col IS NULL)` guard.
 */
const migration: TMigration = {
    name: "20260517101300_create_workspace_settings_table",
    description:
        "Per-workspace JSON settings/preferences/limits — surface for JSON query helpers, JSON aggregates, in-place JSON updates, and the full cast matrix.",

    up: (schema: Schema) => {
        schema.createTable("workspace_settings", (t) => {
            t.id();
            t.text("workspace_id").notNull().unique().references("workspaces", "id").onDelete("cascade");

            // ── full cast coverage ──────────────────────────────────────────
            t.json("preferences", { validate: true }); // cast: "json"  (object)
            t.json("feature_flags", { validate: true }); // cast: "array" (string[])
            t.boolean("notifications_enabled").notNull().default(true); // cast: "boolean"
            t.integer("seat_limit").notNull().default(5); // cast: "integer"
            t.real("storage_quota_gb").notNull().default(1.0); // cast: "real"
            t.text("trial_ends_on"); // cast: "date"
            t.text("activated_at"); // cast: "datetime"
            t.blob("brand_logo"); // cast: "blob"

            t.softDeletes();
            t.timestamps();
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("workspace_settings");
    },
};

export default migration;
