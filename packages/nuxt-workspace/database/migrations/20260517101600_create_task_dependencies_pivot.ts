import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

/**
 * Self-referencing dependency graph between tasks ("task A blocks task B"),
 * plus provenance of who requested the link. This pivot is the demo surface
 * for the new flexible foreign-key forms:
 *
 *  1. Column-level single FK — `references("tasks", "id")` (one name).
 *  2. Table-level COMPOSITE FK — `t.foreign("workspace_id, requested_by", { on: [...] })`
 *     where the parent columns are passed as a `string[]`. This points at the
 *     composite-keyed `workspace_members` pivot.
 *  3. Table-level FK with a comma-separated parent-column string —
 *     `t.foreign("created_via", { references: "users", on: "id" })`.
 *
 * The graph itself (`/api/analytics/critical-path`) is also the recursive-CTE
 * demo (`withRecursive`).
 */
const migration: TMigration = {
    name: "20260517101600_create_task_dependencies_pivot",
    description:
        "Composite-key task dependency pivot — demonstrates column-level single FK, a composite table-level FK with a string[] parent, and a comma/string parent FK.",

    up: (schema: Schema) => {
        schema.createTable("task_dependencies", (t) => {
            // (1) column-level single FK — references(table, column)
            t.text("task_id").notNull().references("tasks", "id").onDelete("cascade");
            t.text("depends_on_id").notNull().references("tasks", "id").onDelete("cascade");

            t.text("workspace_id").notNull();
            t.text("requested_by").notNull();
            t.text("created_via").notNull();
            t.text("kind").notNull().default("blocks");
            t.text("created_at").notNull().defaultRaw("(datetime('now'))");

            // composite PK across the two task columns
            t.primary("task_id, depends_on_id");

            // (2) COMPOSITE table-level FK — parent columns as a string[].
            //     Points at the composite-PK `workspace_members` pivot.
            t.foreign("workspace_id, requested_by", {
                references: "workspace_members",
                on: ["workspace_id", "user_id"],
                onDelete: "cascade",
            });

            // (3) table-level FK with a single string parent column.
            t.foreign("created_via", {
                references: "users",
                on: "id",
                onDelete: "set null",
            });

            t.check("kind IN ('blocks', 'relates', 'duplicates')");
            t.index("depends_on_id");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("task_dependencies");
    },
};

export default migration;
