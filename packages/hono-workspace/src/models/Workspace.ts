import { BaseModel } from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

import { User } from "./User";
import { Project } from "./Project";
import { Post } from "./Post";
import { Tag } from "./Tag";
import { ActivityEvent } from "./ActivityEvent";

interface WorkspaceAttrs {
    id: string;
    slug: string;
    name: string;
    settings: Record<string, unknown> | null;
    created_at?: Date;
    updated_at?: Date;
    deleted_at?: string | null;
}

type WorkspaceRelations = {
    members: User[];
    projects: Project[];
    posts: Post[];
    tags: Tag[];
    activity: ActivityEvent[];
};

export class Workspace extends BaseModel<WorkspaceAttrs, {}, WorkspaceRelations> {
    static table = "workspaces";
    static guarded = [];
    static softDeletes = true;
    static casts = { settings: "json" } as const;

    static relations: Record<string, TRelationDefinition> = {
        members: {
            type: "belongsToMany",
            model: () => User,
            pivot: "workspace_members",
            foreignPivotKey: "workspace_id",
            relatedPivotKey: "user_id",
        },
        projects: {
            type: "hasMany",
            model: () => Project,
            foreignKey: "workspace_id",
        },
        posts: {
            type: "hasMany",
            model: () => Post,
            foreignKey: "workspace_id",
        },
        tags: {
            type: "hasMany",
            model: () => Tag,
            foreignKey: "workspace_id",
        },
        activity: {
            type: "hasMany",
            model: () => ActivityEvent,
            foreignKey: "workspace_id",
        },
    };

    static scopes: Record<string, (q: QueryBuilder<Workspace>) => void> = {
        active: (q) => q.whereNull("deleted_at"),
    };
}
