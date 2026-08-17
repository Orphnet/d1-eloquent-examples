import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517101600_create_release_assets_table",
    description:
        "Build artefacts produced for a project. The composite primary key " +
        "(project_id, version) is the parent referenced by `asset_dependencies` to " +
        "show off composite foreign keys via the flexible FK column API.",

    up: (schema: Schema) => {
        schema.createTable("release_assets", (t) => {
            // FK declared the classic single-column way.
            t.text("project_id").notNull().references("projects", "id").onDelete("cascade");
            t.text("version").notNull();
            t.text("channel").notNull().default("stable");
            t.text("artifact_url").notNull();
            t.integer("size_bytes").notNull().default(0);
            t.text("published_at");
            t.timestamps();

            // Composite primary key — the target of the composite FK below.
            t.primary("project_id, version");
            t.check("channel IN ('stable', 'beta', 'nightly')");
            t.index("channel");
        });
    },

    down: (schema: Schema) => {
        schema.dropTable("release_assets");
    },
};

export default migration;
