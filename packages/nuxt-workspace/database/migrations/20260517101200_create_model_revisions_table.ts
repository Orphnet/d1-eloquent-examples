import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517101200_create_model_revisions_table",
    description: "Shared audit log used by every revision-tracked model (Post, Task in this example).",

    up: (schema: Schema) => {
        schema.createTable("model_revisions", (t) => {
            t.id();
            t.text("model_table").notNull();
            t.text("model_pk").notNull();
            t.text("model_id").notNull();
            t.text("action").notNull();
            t.text("actor_id");
            t.text("request_id");
            t.text("reason");
            t.json("diff_json");
            t.json("before_json");
            t.json("after_json");
            t.text("created_at").notNull();

            t.index("model_table, model_id, created_at");
            t.index("actor_id");
            t.check("action IN ('create', 'update', 'delete')");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("model_revisions");
    },
};

export default migration;
