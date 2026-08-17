import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517100000_create_workspaces_table",
    description: "Top-level tenant. Each workspace owns projects and posts.",

    up: (schema: Schema) => {
        schema.createTable("workspaces", (t) => {
            t.id();
            t.text("slug").notNull().unique();
            t.text("name").notNull();
            t.json("settings", { validate: true });
            t.softDeletes();
            t.timestamps();
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("workspaces");
    },
};

export default migration;
