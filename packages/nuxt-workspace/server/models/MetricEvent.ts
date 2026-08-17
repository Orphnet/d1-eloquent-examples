import { BaseModel } from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

import { Workspace } from "./Workspace";
import { Project } from "./Project";

interface MetricEventAttrs {
    id: string;
    workspace_id: string;
    project_id: string | null;
    metric: "api_calls" | "storage" | "seats" | "bandwidth";
    quantity: number;
    unit_cost: number;
    dimensions: Record<string, unknown> | null;
    /** STORED generated column — `quantity * unit_cost`. Read-only. */
    total_cost: number;
    /** VIRTUAL generated column — `substr(occurred_at, 1, 10)`. Read-only. */
    day_bucket: string;
    occurred_at: string;
    created_at?: Date;
    updated_at?: Date;
}

type MetricEventRelations = {
    workspace: Workspace | null;
    project: Project | null;
};

/**
 * Usage metric events. `total_cost` and `day_bucket` are **generated columns**
 * — the DB computes them, so they are never written by the app (they're not in
 * the insert payload). This model feeds the CTE + aggregate analytics routes.
 */
export class MetricEvent extends BaseModel<MetricEventAttrs, {}, MetricEventRelations> {
    static override table = "metric_events";
    static override guarded = [];
    static override casts = {
        quantity: "integer",
        unit_cost: "real",
        total_cost: "real",
        dimensions: "json",
    } as const;

    static override relations: Record<string, TRelationDefinition> = {
        workspace: {
            type: "belongsTo",
            model: () => Workspace,
            foreignKey: "workspace_id",
        },
        project: {
            type: "belongsTo",
            model: () => Project,
            foreignKey: "project_id",
        },
    };

    static override scopes: Record<string, (q: QueryBuilder<MetricEvent>) => void> = {
        billable: (q) => q.whereRaw("total_cost > 0"),
        forMetric: (q) => q.whereNotNull("metric"),
    };
}
