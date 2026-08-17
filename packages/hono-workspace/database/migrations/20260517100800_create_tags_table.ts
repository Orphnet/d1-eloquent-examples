import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517100800_create_tags_table",
    description: "Tags scoped to a workspace. Attached to Tasks and Posts via the polymorphic taggables pivot.",

    up: (schema: Schema) => {
        schema.createTable("tags", (t) => {
            t.id();
            t.text("workspace_id").notNull().references("workspaces", "id").onDelete("cascade");
            t.text("label").notNull();
            t.text("color", { default: "#94a3b8" });
            t.timestamps();

            t.unique("workspace_id, label");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("tags");
    },
};

export default migration;
