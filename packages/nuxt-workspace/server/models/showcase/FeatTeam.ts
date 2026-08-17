import { BaseModel } from "@orphnet/d1-eloquent";
import type { TRelationDefinition } from "@orphnet/d1-eloquent";

import { FeatMember } from "./FeatMember";

interface FeatTeamAttrs {
    id: string;
    name: string;
}

type FeatTeamRelations = { members: FeatMember[] };

/** Parent for features 2 (whereRelation/firstWhere), 4 (constrained eager
 * loading), and 6 (withMin/withMax/withExists). */
export class FeatTeam extends BaseModel<FeatTeamAttrs, {}, FeatTeamRelations> {
    static override table = "feat_teams";
    static override guarded = [];
    static override timestamps = false;

    static override relations: Record<string, TRelationDefinition> = {
        members: { type: "hasMany", model: () => FeatMember, foreignKey: "team_id" },
    };
}
