import { BaseModel } from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

import { Project } from "./Project";
import { AssetDependency } from "./AssetDependency";

interface ReleaseAssetAttrs {
    project_id: string;
    version: string;
    channel: "stable" | "beta" | "nightly";
    artifact_url: string;
    size_bytes: number;
    published_at: string | null;
    created_at?: Date;
    updated_at?: Date;
}

type ReleaseAssetRelations = {
    project: Project | null;
    /** Dependency edges where this asset is the dependent (it requires others). */
    dependencies: AssetDependency[];
};

/**
 * A build artefact for a project, keyed by the composite (project_id, version)
 * primary key. The composite PK is what `asset_dependencies` references with its
 * composite foreign keys.
 *
 * Note: `primaryKey` is set to the composite-ish "project_id" so the ORM has a
 * lookup column; dependency edges are queried via the `dependencies` relation
 * using both key parts.
 */
export class ReleaseAsset extends BaseModel<ReleaseAssetAttrs, {}, ReleaseAssetRelations> {
    static table = "release_assets";
    static primaryKey = "project_id"; // composite PK — project_id is the lookup anchor
    static guarded = [];
    static casts = { size_bytes: "integer" } as const;

    static relations: Record<string, TRelationDefinition> = {
        project: {
            type: "belongsTo",
            model: () => Project,
            foreignKey: "project_id",
        },
        dependencies: {
            type: "hasMany",
            model: () => AssetDependency,
            foreignKey: "dependent_project_id",
            localKey: "project_id",
        },
    };

    static scopes: Record<string, (q: QueryBuilder<ReleaseAsset>) => void> = {
        stable: (q) => q.whereEq("channel", "stable"),
    };
}
