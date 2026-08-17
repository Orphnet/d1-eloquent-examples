import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517100100_create_users_table",
    description: "Global users — joined to workspaces via the members pivot.",

    up: (schema: Schema) => {
        schema.createTable("users", (t) => {
            t.id();
            t.text("email").notNull().unique().collate("NOCASE");
            t.text("name").notNull();
            t.text("avatar_url");
            t.boolean("is_admin", { default: false });
            t.softDeletes();
            t.timestamps();
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("users");
    },
};

export default migration;
