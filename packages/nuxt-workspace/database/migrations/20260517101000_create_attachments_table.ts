import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517101000_create_attachments_table",
    description: "Polymorphic attachments — BLOB body, attached to a Task or Post via attachable_type+id.",

    up: (schema: Schema) => {
        schema.createTable("attachments", (t) => {
            t.id();
            t.text("uploader_id").notNull().references("users", "id").onDelete("restrict");
            t.text("attachable_type").notNull();
            t.text("attachable_id").notNull();
            t.text("filename").notNull();
            t.text("mime_type").notNull();
            t.integer("size_bytes").notNull();
            t.blob("data").notNull();
            t.timestamps();

            t.index("attachable_type, attachable_id");
            t.check("size_bytes >= 0");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("attachments");
    },
};

export default migration;
