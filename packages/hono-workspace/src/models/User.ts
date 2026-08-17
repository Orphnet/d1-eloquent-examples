import { BaseModel } from "@orphnet/d1-eloquent";
import type { TRelationDefinition } from "@orphnet/d1-eloquent";

import { Workspace } from "./Workspace";
import { Task } from "./Task";
import { Post } from "./Post";
import { Comment } from "./Comment";

interface UserAttrs {
    id: string;
    email: string;
    name: string;
    avatar_url: string | null;
    is_admin: boolean;
    created_at?: Date;
    updated_at?: Date;
    deleted_at?: string | null;
}

type UserRelations = {
    workspaces: Workspace[];
    assignedTasks: Task[];
    posts: Post[];
    comments: Comment[];
};

export class User extends BaseModel<UserAttrs, {}, UserRelations> {
    static table = "users";
    static guarded = [];
    static softDeletes = true;
    static casts = { is_admin: "boolean" } as const;
    static hidden = []; // expose all fields by default; secret fields would go here

    static relations: Record<string, TRelationDefinition> = {
        workspaces: {
            type: "belongsToMany",
            model: () => Workspace,
            pivot: "workspace_members",
            foreignPivotKey: "user_id",
            relatedPivotKey: "workspace_id",
        },
        assignedTasks: {
            type: "hasMany",
            model: () => Task,
            foreignKey: "assignee_id",
        },
        posts: {
            type: "hasMany",
            model: () => Post,
            foreignKey: "author_id",
        },
        comments: {
            type: "hasMany",
            model: () => Comment,
            foreignKey: "author_id",
        },
    };
}
