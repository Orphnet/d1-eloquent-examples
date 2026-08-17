import { BaseModel } from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

import { Project } from "./Project";

interface MetricSnapshotAttrs {
    id: string;
    project_id: string;
    captured_on: string; // cast: 'date'
    visits: number; // cast: 'integer'
    conversion_rate: number; // cast: 'real'
    is_partial: boolean; // cast: 'boolean'
    /** Hourly buckets, e.g. [{ hour: 0, visits: 12 }, ...]. cast: 'array'. */
    series: Array<{ hour: number; visits: number }>;
    /** Channel → count map. cast: 'json'. */
    breakdown: Record<string, number> | null;
    /** Tiny sparkline PNG. cast: 'blob' → ArrayBuffer. */
    thumbnail: ArrayBuffer | null;
    captured_at: string; // cast: 'datetime'
    created_at?: Date;
    updated_at?: Date;
}

type MetricSnapshotRelations = {
    project: Project | null;
};

/**
 * Daily analytics snapshot per project — the single model that demonstrates
 * the **full cast matrix**: json, array, boolean, integer, real, date,
 * datetime, blob. Also the data source for the JSON-aggregate route demos.
 */
export class MetricSnapshot extends BaseModel<MetricSnapshotAttrs, {}, MetricSnapshotRelations> {
    static table = "metric_snapshots";
    static guarded = [];
    static casts = {
        captured_on: "date",
        visits: "integer",
        conversion_rate: "real",
        is_partial: "boolean",
        series: "array",
        breakdown: "json",
        thumbnail: "blob",
        captured_at: "datetime",
    } as const;

    static relations: Record<string, TRelationDefinition> = {
        project: {
            type: "belongsTo",
            model: () => Project,
            foreignKey: "project_id",
        },
    };

    static scopes: Record<string, (q: QueryBuilder<MetricSnapshot>) => void> = {
        complete: (q) => q.whereEq("is_partial", false),
        busy: (q) => q.where("visits", ">=", 100),
    };
}
