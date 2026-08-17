import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517102000_create_showcase_through_tables",
    description:
        "Backs the /api/features through-relations demo - a Country → Citizen → Article chain " +
        "for hasManyThrough / hasOneThrough. A country's articles are reached across the " +
        "intermediate citizens table (citizens.country_id, articles.citizen_id).",

    up: (schema: Schema) => {
        schema.createTable("showcase_countries", (t) => {
            t.id();
            t.text("name");
        });
        schema.createTable("showcase_citizens", (t) => {
            t.id();
            t.text("country_id");
            t.text("name");
            t.index("country_id");
        });
        schema.createTable("showcase_articles", (t) => {
            t.id();
            t.text("citizen_id");
            t.text("title");
            t.index("citizen_id");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("showcase_articles");
        schema.dropTable("showcase_citizens");
        schema.dropTable("showcase_countries");
    },
};

export default migration;
