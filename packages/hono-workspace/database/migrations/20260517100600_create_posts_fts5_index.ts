import type { TMigration } from "@orphnet/d1-eloquent/cli";
import { Schema } from "@orphnet/d1-eloquent/cli";

const migration: TMigration = {
    name: "20260517100600_create_posts_fts5_index",
    description: "External-content FTS5 index over posts.title + posts.body for /api/search.",

    up: (schema: Schema) => {
        schema.createFts5Table("posts_search", {
            columns: ["title", "body"],
            tokenize: "porter unicode61 remove_diacritics 2",
            content: "posts",
            contentRowid: "rowid",
            prefix: [2, 3],
            contentSyncTriggers: true,
        });
    },

    down: (schema: Schema) => {
        schema.raw("DROP TABLE IF EXISTS posts_search");
        schema.dropTrigger("posts_search_ai");
        schema.dropTrigger("posts_search_ad");
        schema.dropTrigger("posts_search_au");
    },
};

export default migration;
