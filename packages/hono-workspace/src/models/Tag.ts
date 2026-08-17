import { BaseModel } from "@orphnet/d1-eloquent";
import type { TRelationDefinition } from "@orphnet/d1-eloquent";

import { Workspace } from "./Workspace";
import { Task } from "./Task";
import { Post } from "./Post";

interface TagAttrs {
    id: string;
    workspace_id: string;
    label: string;
    color: string;
    created_at?: Date;
    updated_at?: Date;
}

type TagRelations = {
    workspace: Workspace | null;
    /** Inverse polymorphic many-to-many — Tag → many Tasks. */
    tasks: Task[];
    /** Inverse polymorphic many-to-many — Tag → many Posts. */
    posts: Post[];
};

export class Tag extends BaseModel<TagAttrs, {}, TagRelations> {
    static table = "tags";
    static guarded = [];

    static relations: Record<string, TRelationDefinition> = {
        workspace: {
            type: "belongsTo",
            model: () => Workspace,
            foreignKey: "workspace_id",
        },
        tasks: {
            type: "morphedByMany",
            model: () => Task,
            pivot: "taggables",
            morphName: "taggable",
            typeValue: "task",
            relatedPivotKey: "tag_id",
        },
        posts: {
            type: "morphedByMany",
            model: () => Post,
            pivot: "taggables",
            morphName: "taggable",
            typeValue: "post",
            relatedPivotKey: "tag_id",
        },
    };
}
