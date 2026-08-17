import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517101800_create_showcase_docs_table",
    description:
        "Backs the /api/features enumCast demo (ShowcaseDoc). Statuses are stored as plain " +
        "TEXT/INTEGER - the enum validation lives in the model cast, not a DB CHECK, so the " +
        "showcase can plant an out-of-set value and demonstrate onInvalidRead. The `tags` " +
        "column is intentionally absent here; it is added by the schema-diff generated " +
        "migration (see the feature-12 docs).",

    up: (schema: Schema) => {
        schema.createTable("showcase_docs", (t) => {
            t.id();
            t.text("status");
            t.integer("level");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("showcase_docs");
    },
};

export default migration;
