import { BaseModel } from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

import { Workspace } from "./Workspace";
import { User } from "./User";
import { Comment } from "./Comment";
import { Tag } from "./Tag";
import { Attachment } from "./Attachment";

interface PostAttrs {
    id: string;
    workspace_id: string;
    author_id: string;
    slug: string;
    title: string;
    body: string;
    status: "draft" | "published" | "archived";
    metadata: Record<string, unknown> | null;
    published_at: string | null;
    view_count: number;
    created_at?: Date;
    updated_at?: Date;
    deleted_at?: string | null;
}

type PostRelations = {
    workspace: Workspace | null;
    author: User | null;
    comments: Comment[];
    tags: Tag[];
    attachments: Attachment[];
};

export class Post extends BaseModel<PostAttrs, {}, PostRelations> {
    static override table = "posts";
    static override guarded = [];
    static override softDeletes = true;
    static override casts = { metadata: "json", view_count: "integer" } as const;

    static override revisions = {
        enabled: true,
        mode: "before+after" as const,
        includeRequestId: true,
    };
    /** Auditing body is fine; auditing view_count counter churn is wasteful. */
    static override revisionRedact = ["view_count", "updated_at"];

    static override relations: Record<string, TRelationDefinition> = {
        workspace: {
            type: "belongsTo",
            model: () => Workspace,
            foreignKey: "workspace_id",
        },
        author: {
            type: "belongsTo",
            model: () => User,
            foreignKey: "author_id",
        },
        comments: {
            type: "morphMany",
            model: () => Comment,
            morphName: "commentable",
            typeValue: "post",
        },
        tags: {
            type: "morphToMany",
            model: () => Tag,
            pivot: "taggables",
            morphName: "taggable",
            typeValue: "post",
            relatedPivotKey: "tag_id",
        },
        attachments: {
            type: "morphMany",
            model: () => Attachment,
            morphName: "attachable",
            typeValue: "post",
        },
    };

    static override scopes: Record<string, (q: QueryBuilder<Post>) => void> = {
        published: (q) =>
            q.whereEq("status", "published").whereNotNull("published_at"),
        draft: (q) => q.whereEq("status", "draft"),
        recent: (q) => q.orderBy("published_at", "desc"),
    };
}
