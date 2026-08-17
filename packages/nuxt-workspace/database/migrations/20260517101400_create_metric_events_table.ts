import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

/**
 * Raw usage/billing metric events. This table is the demo surface for:
 *
 *  - GENERATED columns — `total_cost` (STORED, materialised on write) and
 *    `day_bucket` (VIRTUAL, computed on read).
 *  - CHECK constraints — both column-level (`.check(...)`) and table-level
 *    (`t.check(...)`), plus the implicit CHECK that `t.json({ validate })`
 *    emits.
 *  - CTEs + scalar/relation aggregates downstream (`/api/analytics/*`).
 *
 * STORED generated columns require the expression's inputs to be in the same
 * row and only reference other columns — so `total_cost = quantity * unit_cost`.
 * The VIRTUAL `day_bucket` slices `occurred_at` to a date for GROUP BY.
 */
const migration: TMigration = {
    name: "20260517101400_create_metric_events_table",
    description:
        "Usage metric events with STORED + VIRTUAL generated columns and column/table CHECK constraints; feeds CTE + aggregate analytics.",

    up: (schema: Schema) => {
        schema.createTable("metric_events", (t) => {
            t.id();
            t.text("workspace_id").notNull().references("workspaces", "id").onDelete("cascade");
            t.text("project_id").references("projects", "id").onDelete("set null");

            t.text("metric").notNull(); // e.g. "api_calls", "storage", "seats"
            t.integer("quantity").notNull().default(0).check("quantity >= 0"); // column-level CHECK
            t.real("unit_cost").notNull().default(0); // price per unit
            t.json("dimensions", { validate: true }); // arbitrary JSON tags

            // STORED generated column — materialised at write time.
            t.real("total_cost").generatedAs("quantity * unit_cost", "stored");
            // VIRTUAL generated column — computed on read, no storage.
            t.text("day_bucket").generatedAs("substr(occurred_at, 1, 10)", "virtual");

            t.text("occurred_at").notNull().defaultRaw("(datetime('now'))");
            t.timestamps();

            // table-level CHECK — constrains the metric enum
            t.check("metric IN ('api_calls', 'storage', 'seats', 'bandwidth')", "ck_metric_events_metric");
            t.index("workspace_id, metric");
            t.index("occurred_at");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("metric_events");
    },
};

export default migration;
