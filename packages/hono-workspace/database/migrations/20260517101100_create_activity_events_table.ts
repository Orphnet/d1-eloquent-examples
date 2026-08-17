import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517101100_create_activity_events_table",
    description: "Activity feed — polymorphic subject + JSON payload, cursor-paginated by created_at + id.",

    up: (schema: Schema) => {
        schema.createTable("activity_events", (t) => {
            t.id();
            t.text("workspace_id").notNull().references("workspaces", "id").onDelete("cascade");
            t.text("actor_id").references("users", "id").onDelete("set null");
            t.text("verb").notNull();
            t.text("subject_type").notNull();
            t.text("subject_id").notNull();
            t.json("payload");
            t.timestamps();

            t.index("workspace_id, created_at, id");
            t.index("subject_type, subject_id");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("activity_events");
    },
};

export default migration;
