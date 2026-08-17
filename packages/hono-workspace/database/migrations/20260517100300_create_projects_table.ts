import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517100300_create_projects_table",
    description: "Projects belong to a workspace and contain tasks.",

    up: (schema: Schema) => {
        schema.createTable("projects", (t) => {
            t.id();
            t.text("workspace_id").notNull().references("workspaces", "id").onDelete("cascade");
            t.text("name").notNull();
            t.text("slug").notNull();
            t.text("description");
            t.text("color", { default: "#3b82f6" });
            t.softDeletes();
            t.timestamps();

            // Slug unique within a workspace, partial to ignore soft-deleted rows
            t.unique("workspace_id, slug", "uidx_projects_ws_slug", {
                where: "deleted_at IS NULL",
            });
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("projects");
    },
};

export default migration;
