import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517100700_create_comments_table",
    description: "Polymorphic comments — attach to either a Task or a Post via commentable_type+id.",

    up: (schema: Schema) => {
        schema.createTable("comments", (t) => {
            t.id();
            t.text("author_id").notNull().references("users", "id").onDelete("restrict");
            t.text("body").notNull();
            t.text("commentable_type").notNull();
            t.text("commentable_id").notNull();
            t.boolean("approved", { default: true });
            t.softDeletes();
            t.timestamps();

            t.index("commentable_type, commentable_id");
            t.index("author_id");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("comments");
    },
};

export default migration;
