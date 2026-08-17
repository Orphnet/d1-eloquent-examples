import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517101500_create_audit_events_table",
    description:
        "Append-only audit ledger demonstrating GENERATED columns (virtual + stored) and " +
        "CHECK constraints. `severity_rank` is a STORED generated column (materialised on " +
        "write); `event_label` is a VIRTUAL generated column (computed on read). RETURNING " +
        "demos read these computed values back in a single round-trip.",

    up: (schema: Schema) => {
        schema.createTable("audit_events", (t) => {
            t.id();
            t.text("workspace_id").notNull().references("workspaces", "id").onDelete("cascade");
            t.text("actor_id").references("users", "id").onDelete("set null");
            t.text("action").notNull();
            t.text("resource_type").notNull();
            t.text("resource_id").notNull();
            t.text("severity").notNull().default("info");
            t.integer("amount_cents").notNull().default(0);

            // STORED generated column — materialised on write. Maps the textual
            // severity onto a numeric rank so we can ORDER BY / filter cheaply.
            t.integer("severity_rank").generatedAs(
                "CASE severity " +
                    "WHEN 'critical' THEN 40 " +
                    "WHEN 'error' THEN 30 " +
                    "WHEN 'warning' THEN 20 " +
                    "ELSE 10 END",
                "stored",
            );

            // VIRTUAL generated column — evaluated on read, no storage. A handy
            // pre-formatted label like "task:abc123 (error)".
            t.text("event_label").generatedAs(
                "resource_type || ':' || resource_id || ' (' || severity || ')'",
                "virtual",
            );

            // STORED generated column derived from a JSON-less numeric field —
            // dollars from cents, rounded to 2 dp.
            t.real("amount_dollars").generatedAs("ROUND(amount_cents / 100.0, 2)", "stored");

            t.text("occurred_at").notNull();
            t.timestamps();

            t.check("severity IN ('info', 'warning', 'error', 'critical')");
            t.check("amount_cents >= 0");
            t.index("workspace_id, occurred_at");
            t.index("severity_rank");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("audit_events");
    },
};

export default migration;
