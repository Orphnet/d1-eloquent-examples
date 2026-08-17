import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517101400_create_metric_snapshots_table",
    description:
        "Per-project daily analytics snapshots. `series` is a JSON array of hourly buckets, " +
        "`breakdown` a JSON object. Powers the JSON-aggregate (json_group_array / " +
        "json_group_object) and orderByJsonPath demos, plus full cast coverage.",

    up: (schema: Schema) => {
        schema.createTable("metric_snapshots", (t) => {
            t.id();
            t.text("project_id").notNull().references("projects", "id").onDelete("cascade");
            t.text("captured_on").notNull(); // ISO date — cast: 'date'
            t.integer("visits").notNull().default(0); // cast: 'integer'
            t.real("conversion_rate").notNull().default(0); // cast: 'real'
            t.boolean("is_partial").notNull().default(false); // cast: 'boolean'
            t.json("series", { validate: true }).defaultRaw("(json('[]'))"); // cast: 'array'
            t.json("breakdown", { validate: true }); // cast: 'json'
            t.blob("thumbnail"); // cast: 'blob' — tiny sparkline PNG bytes
            t.text("captured_at").notNull(); // cast: 'datetime'
            t.timestamps();

            t.check("conversion_rate >= 0 AND conversion_rate <= 1");
            t.unique("project_id, captured_on");
            t.index("captured_on");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("metric_snapshots");
    },
};

export default migration;
