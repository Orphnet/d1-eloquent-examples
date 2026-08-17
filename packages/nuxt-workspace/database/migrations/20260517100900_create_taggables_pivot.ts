import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517100900_create_taggables_pivot",
    description: "Polymorphic many-to-many pivot for tags <-> (Task | Post).",

    up: (schema: Schema) => {
        schema.createTable("taggables", (t) => {
            t.text("tag_id").notNull().references("tags", "id").onDelete("cascade");
            t.text("taggable_type").notNull();
            t.text("taggable_id").notNull();
            t.text("attached_at").notNull().defaultRaw("(datetime('now'))");
            t.primary("tag_id, taggable_type, taggable_id");
            t.index("taggable_type, taggable_id");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("taggables");
    },
};

export default migration;
