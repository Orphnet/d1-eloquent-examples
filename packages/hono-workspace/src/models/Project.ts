import { BaseModel } from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

import { Workspace } from "./Workspace";
import { Task } from "./Task";
import { MetricSnapshot } from "./MetricSnapshot";

interface ProjectAttrs {
    id: string;
    workspace_id: string;
    name: string;
    slug: string;
    description: string | null;
    color: string;
    created_at?: Date;
    updated_at?: Date;
    deleted_at?: string | null;
}

type ProjectRelations = {
    workspace: Workspace | null;
    tasks: Task[];
    metrics: MetricSnapshot[];
};

export class Project extends BaseModel<ProjectAttrs, {}, ProjectRelations> {
    static table = "projects";
    static guarded = [];
    static softDeletes = true;

    static relations: Record<string, TRelationDefinition> = {
        workspace: {
            type: "belongsTo",
            model: () => Workspace,
            foreignKey: "workspace_id",
        },
        tasks: {
            type: "hasMany",
            model: () => Task,
            foreignKey: "project_id",
        },
        metrics: {
            type: "hasMany",
            model: () => MetricSnapshot,
            foreignKey: "project_id",
        },
    };

    /**
     * Nested eager loading. Auto-derived loaders cover single-level relations
     * (`with(['tasks'])`); dot-notation chains like `with(['tasks.assignee'])`
     * need an explicit loader. This one loads each project's tasks, then
     * eager-loads every task's `assignee` in one extra pass.
     */
    static eagerLoaders: Record<string, (db: D1Database, projects: Project[]) => Promise<void>> = {
        "tasks.assignee": async (db, projects) => {
            // 1. Batch-load tasks for every project (single whereIn).
            await Promise.all(projects.map((p) => p.load(db, "tasks")));
            // 2. Collect the loaded tasks and batch-load their assignees.
            const tasks = projects.flatMap((p) => p.relations?.tasks ?? []);
            await Promise.all(tasks.map((t) => t.load(db, "assignee")));
        },
    };

    static scopes: Record<string, (q: QueryBuilder<Project>) => void> = {
        active: (q) => q.whereNull("deleted_at"),
    };
}
