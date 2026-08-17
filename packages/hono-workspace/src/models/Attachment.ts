import { BaseModel } from "@orphnet/d1-eloquent";
import type { TRelationDefinition } from "@orphnet/d1-eloquent";

import { User } from "./User";
import { Task } from "./Task";
import { Post } from "./Post";

interface AttachmentAttrs {
    id: string;
    uploader_id: string;
    attachable_type: string;
    attachable_id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    /** D1 BLOB → ArrayBuffer. Big payloads should be in R2 instead. */
    data: ArrayBuffer;
    created_at?: Date;
    updated_at?: Date;
}

type AttachmentRelations = {
    uploader: User | null;
    attachable: Task | Post | null;
};

export class Attachment extends BaseModel<AttachmentAttrs, {}, AttachmentRelations> {
    static table = "attachments";
    static guarded = [];
    static casts = { size_bytes: "integer", data: "blob" } as const;
    /** Hide BLOB body from default JSON serialization — read it via the dedicated endpoint. */
    static hidden = ["data"];

    static relations: Record<string, TRelationDefinition> = {
        uploader: {
            type: "belongsTo",
            model: () => User,
            foreignKey: "uploader_id",
        },
        attachable: {
            type: "morphTo",
            morphName: "attachable",
            morphMap: {
                task: () => Task,
                post: () => Post,
            },
        },
    };
}
