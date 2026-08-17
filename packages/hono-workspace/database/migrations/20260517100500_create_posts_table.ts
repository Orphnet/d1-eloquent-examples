import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517100500_create_posts_table",
    description: "Blog posts within a workspace. Body is full-text searchable via a sibling FTS5 table.",

    up: (schema: Schema) => {
        schema.createTable("posts", (t) => {
            t.id();
            t.text("workspace_id").notNull().references("workspaces", "id").onDelete("cascade");
            t.text("author_id").notNull().references("users", "id").onDelete("restrict");
            t.text("slug").notNull();
            t.text("title").notNull();
            t.text("body").notNull();
            t.text("status").notNull().default("draft");
            t.json("metadata", { validate: true });
            t.text("published_at");
            t.integer("view_count").notNull().default(0);
            t.softDeletes();
            t.timestamps();

            t.check("status IN ('draft', 'published', 'archived')");
            t.unique("workspace_id, slug", "uidx_posts_ws_slug", { where: "deleted_at IS NULL" });
            t.index("workspace_id, status, published_at");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("posts");
    },
};

export default migration;
