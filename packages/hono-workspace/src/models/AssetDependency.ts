import { BaseModel } from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

import { User } from "./User";

interface AssetDependencyAttrs {
    id: string;
    dependent_project_id: string;
    dependent_version: string;
    requires_project_id: string;
    requires_version: string;
    requested_by: string | null;
    constraint_kind: "requires" | "optional" | "conflicts";
    created_at?: Date;
    updated_at?: Date;
}

type AssetDependencyRelations = {
    requester: User | null;
};

/**
 * A dependency edge in the release-asset graph. Persists two composite foreign
 * keys back to `release_assets(project_id, version)` — see the migration for
 * the three FK declaration forms it exercises.
 */
export class AssetDependency extends BaseModel<AssetDependencyAttrs, {}, AssetDependencyRelations> {
    static table = "asset_dependencies";
    static guarded = [];

    static relations: Record<string, TRelationDefinition> = {
        requester: {
            type: "belongsTo",
            model: () => User,
            foreignKey: "requested_by",
        },
    };

    static scopes: Record<string, (q: QueryBuilder<AssetDependency>) => void> = {
        hard: (q) => q.whereEq("constraint_kind", "requires"),
    };
}
