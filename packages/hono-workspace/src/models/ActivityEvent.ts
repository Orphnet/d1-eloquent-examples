import { BaseModel } from "@orphnet/d1-eloquent";
import type { TRelationDefinition } from "@orphnet/d1-eloquent";

import { Workspace } from "./Workspace";
import { User } from "./User";
import { Task } from "./Task";
import { Post } from "./Post";

interface ActivityEventAttrs {
    id: string;
    workspace_id: string;
    actor_id: string | null;
    verb: string;
    subject_type: string;
    subject_id: string;
    payload: Record<string, unknown> | null;
    created_at?: Date;
    updated_at?: Date;
}

type ActivityEventRelations = {
    workspace: Workspace | null;
    actor: User | null;
    subject: Task | Post | null;
};

/**
 * Activity events power the cursor-paginated feed. Polymorphic on `subject`,
 * with a JSON `payload` for verb-specific data.
 */
export class ActivityEvent extends BaseModel<ActivityEventAttrs, {}, ActivityEventRelations> {
    static table = "activity_events";
    static guarded = [];
    static casts = { payload: "json" } as const;

    static relations: Record<string, TRelationDefinition> = {
        workspace: {
            type: "belongsTo",
            model: () => Workspace,
            foreignKey: "workspace_id",
        },
        actor: {
            type: "belongsTo",
            model: () => User,
            foreignKey: "actor_id",
        },
        subject: {
            type: "morphTo",
            morphName: "subject",
            morphMap: {
                task: () => Task,
                post: () => Post,
            },
        },
    };
}
