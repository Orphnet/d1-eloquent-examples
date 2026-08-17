import { BaseModel } from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

import { Project } from "./Project";

interface ReleaseAttrs {
    id: string;
    project_id: string;
    version: string;
    channel: "stable" | "beta" | "canary";
    notes: string | null;
    downloads: number;
    artifacts: Array<{ os: string; url: string }> | null;
    published_at: string | null;
    created_at?: Date;
    updated_at?: Date;
}

type ReleaseRelations = {
    project: Project | null;
};

/**
 * Project releases — surface for RETURNING clauses, batch inserts, and
 * upsert-with-conflict-target. `(project_id, version)` is unique so the same
 * version "re-publishes" via upsert rather than duplicating.
 */
export class Release extends BaseModel<ReleaseAttrs, {}, ReleaseRelations> {
    static override table = "releases";
    static override guarded = [];
    static override casts = { downloads: "integer", artifacts: "json" } as const;

    static override relations: Record<string, TRelationDefinition> = {
        project: {
            type: "belongsTo",
            model: () => Project,
            foreignKey: "project_id",
        },
    };

    static override scopes: Record<string, (q: QueryBuilder<Release>) => void> = {
        stable: (q) => q.whereEq("channel", "stable"),
        published: (q) => q.whereNotNull("published_at"),
    };
}
