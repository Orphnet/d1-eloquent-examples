import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517100200_create_workspace_members_pivot",
    description: "Pivot: users <-> workspaces (belongsToMany).",

    up: (schema: Schema) => {
        schema.createTable("workspace_members", (t) => {
            t.text("workspace_id").notNull().references("workspaces", "id").onDelete("cascade");
            t.text("user_id").notNull().references("users", "id").onDelete("cascade");
            t.text("role").notNull().default("member");
            t.text("joined_at").notNull().defaultRaw("(datetime('now'))");
            t.primary("workspace_id, user_id");
            t.index("user_id");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("workspace_members");
    },
};

export default migration;
