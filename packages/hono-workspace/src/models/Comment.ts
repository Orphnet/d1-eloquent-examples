import { BaseModel } from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

import { User } from "./User";
import { Task } from "./Task";
import { Post } from "./Post";

interface CommentAttrs {
    id: string;
    author_id: string;
    body: string;
    commentable_type: string;
    commentable_id: string;
    approved: boolean;
    created_at?: Date;
    updated_at?: Date;
    deleted_at?: string | null;
}

type CommentRelations = {
    author: User | null;
    /** morphTo — resolves to a Task OR a Post depending on `commentable_type`. */
    commentable: Task | Post | null;
};

export class Comment extends BaseModel<CommentAttrs, {}, CommentRelations> {
    static table = "comments";
    static guarded = [];
    static softDeletes = true;
    static casts = { approved: "boolean" } as const;

    static relations: Record<string, TRelationDefinition> = {
        author: {
            type: "belongsTo",
            model: () => User,
            foreignKey: "author_id",
        },
        commentable: {
            type: "morphTo",
            morphName: "commentable",
            morphMap: {
                task: () => Task,
                post: () => Post,
            },
        },
    };

    static scopes: Record<string, (q: QueryBuilder<Comment>) => void> = {
        approved: (q) => q.whereEq("approved", true),
    };
}
