import { BaseModel } from "@orphnet/d1-eloquent";
import type { TRelationDefinition } from "@orphnet/d1-eloquent";

import { FeatTeam } from "./FeatTeam";

interface FeatMemberAttrs {
    id: string;
    team_id: string;
    name: string;
    role: string;
    seniority: number;
}

type FeatMemberRelations = { team: FeatTeam | null };

/** Child of {@link FeatTeam} - used by whereRelation, constrained eager loading,
 * withMin/withMax/withExists, and prepared queries (features 2, 4, 6, 11). */
export class FeatMember extends BaseModel<FeatMemberAttrs, {}, FeatMemberRelations> {
    static override table = "feat_members";
    static override guarded = [];
    static override timestamps = false;
    static override casts = { seniority: "integer" } as const;

    static override relations: Record<string, TRelationDefinition> = {
        team: { type: "belongsTo", model: () => FeatTeam, foreignKey: "team_id" },
    };
}
