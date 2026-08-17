import { BaseModel } from "@orphnet/d1-eloquent";
import type { QueryBuilder, THooks, TRelationDefinition } from "@orphnet/d1-eloquent";

import { Project } from "./Project";
import { User } from "./User";
import { Comment } from "./Comment";
import { Tag } from "./Tag";
import { Attachment } from "./Attachment";

interface TaskAttrs {
    id: string;
    project_id: string;
    parent_id: string | null;
    assignee_id: string | null;
    title: string;
    description: string | null;
    status: "open" | "in_progress" | "done" | "cancelled";
    priority: number;
    estimated_hours: number | null;
    due_at: string | null;
    completed_at: string | null;
    created_at?: Date;
    updated_at?: Date;
    deleted_at?: string | null;
}

type TaskRelations = {
    project: Project | null;
    parent: Task | null;
    subtasks: Task[];
    assignee: User | null;
    comments: Comment[];
    tags: Tag[];
    attachments: Attachment[];
};

/**
 * Tasks have revision tracking enabled — every save / delete writes a row
 * to `model_revisions` so `/api/audit/tasks/:id` can reconstruct history
 * and `Task.asOf(env.DB, id, isoTimestamp)` works for time-travel.
 */
export class Task extends BaseModel<TaskAttrs, {}, TaskRelations> {
    static table = "tasks";
    static guarded = [];
    static softDeletes = true;
    static casts = { priority: "integer", estimated_hours: "real" } as const;

    static revisions = {
        enabled: true,
        mode: "diff+after" as const,
        includeRequestId: true,
    };
    /** Don't audit the `updated_at` churn — it's noise. */
    static revisionRedact = ["updated_at"];

    static relations: Record<string, TRelationDefinition> = {
        project: {
            type: "belongsTo",
            model: () => Project,
            foreignKey: "project_id",
        },
        parent: {
            type: "belongsTo",
            model: () => Task,
            foreignKey: "parent_id",
        },
        subtasks: {
            type: "hasMany",
            model: () => Task,
            foreignKey: "parent_id",
        },
        assignee: {
            type: "belongsTo",
            model: () => User,
            foreignKey: "assignee_id",
        },
        comments: {
            type: "morphMany",
            model: () => Comment,
            morphName: "commentable",
            typeValue: "task",
        },
        tags: {
            type: "morphToMany",
            model: () => Tag,
            pivot: "taggables",
            morphName: "taggable",
            typeValue: "task",
            relatedPivotKey: "tag_id",
        },
        attachments: {
            type: "morphMany",
            model: () => Attachment,
            morphName: "attachable",
            typeValue: "task",
        },
    };

    static scopes: Record<string, (q: QueryBuilder<Task>) => void> = {
        open: (q) => q.whereIn("status", ["open", "in_progress"]),
        done: (q) => q.whereEq("status", "done"),
        forAssignee: (q) => q.whereNotNull("assignee_id"),
    };

    static hooks: THooks<Task> = {
        creating: (m) => {
            // Default priority if not set
            if (m.get("priority") == null) m.set("priority", 0);
        },
        updating: (m) => {
            // Auto-stamp completed_at on transition to done
            if (m.isDirty("status") && m.get("status") === "done" && !m.get("completed_at")) {
                m.set("completed_at", new Date().toISOString());
            }
        },
    };
}
