import { BaseModel } from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

import { Workspace } from "./Workspace";
import { Task } from "./Task";
import { Release } from "./Release";

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
    releases: Release[];
};

export class Project extends BaseModel<ProjectAttrs, {}, ProjectRelations> {
    static override table = "projects";
    static override guarded = [];
    static override softDeletes = true;

    static override relations: Record<string, TRelationDefinition> = {
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
        releases: {
            type: "hasMany",
            model: () => Release,
            foreignKey: "project_id",
        },
    };

    static override scopes: Record<string, (q: QueryBuilder<Project>) => void> = {
        active: (q) => q.whereNull("deleted_at"),
    };
}
