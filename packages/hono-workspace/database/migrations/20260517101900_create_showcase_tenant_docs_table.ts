import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517101900_create_showcase_tenant_docs_table",
    description:
        "Backs the /api/features global-scope demo (ShowcaseTenantDoc). A tenant column the " +
        "model's user-defined globalScope filters on, so every query is auto-scoped to the " +
        "current tenant unless withoutGlobalScope(s) opts out.",

    up: (schema: Schema) => {
        schema.createTable("showcase_tenant_docs", (t) => {
            t.id();
            t.text("tenant").notNull();
            t.text("title");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("showcase_tenant_docs");
    },
};

export default migration;
