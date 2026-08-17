import { BaseModel, Attribute } from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

import { Workspace } from "./Workspace";

interface WorkspaceSettingAttrs {
    id: string;
    workspace_id: string;
    /** cast: "json" — free-form object */
    preferences: Record<string, unknown> | null;
    /** cast: "array" — string[] stored as a JSON array */
    feature_flags: string[] | null;
    /** cast: "boolean" — 0/1 in SQLite ↔ true/false */
    notifications_enabled: boolean;
    /** cast: "integer" */
    seat_limit: number;
    /** cast: "real" */
    storage_quota_gb: number;
    /** cast: "date" — date-only string */
    trial_ends_on: string | null;
    /** cast: "datetime" — full ISO timestamp */
    activated_at: string | null;
    /** cast: "blob" — D1 returns ArrayBuffer */
    brand_logo: ArrayBuffer | null;
    created_at?: Date;
    updated_at?: Date;
    deleted_at?: string | null;
}

/** Virtual (appended) attributes produced by accessors. */
type WorkspaceSettingVirtuals = {
    /** Computed read-only flag from `seat_limit`. */
    is_team_plan: boolean;
    /** Human label combining quota + seats. */
    plan_summary: string;
};

type WorkspaceSettingRelations = {
    workspace: Workspace | null;
};

/**
 * Per-workspace settings. Exercises the **full cast matrix** (json / array /
 * boolean / integer / real / date / datetime / blob), plus **accessors &
 * mutators** (`static override accessors` with `Attribute`), **appends** (virtual
 * attributes serialised into `toJSON()`), and **hidden** fields (the raw blob
 * is never serialised).
 */
export class WorkspaceSetting extends BaseModel<
    WorkspaceSettingAttrs,
    WorkspaceSettingVirtuals,
    WorkspaceSettingRelations
> {
    static override table = "workspace_settings";
    static override guarded = [];
    static override softDeletes = true;

    static override casts = {
        preferences: "json",
        feature_flags: "array",
        notifications_enabled: "boolean",
        seat_limit: "integer",
        storage_quota_gb: "real",
        trial_ends_on: "date",
        activated_at: "datetime",
        brand_logo: "blob",
    } as const;

    /** Never leak the binary logo through default JSON serialization. */
    static override hidden = ["brand_logo"];

    /** Surface the virtual accessors in toJSON() output. */
    static override appends = ["is_team_plan", "plan_summary"];

    static override accessors = {
        /** Read-only accessor → appended virtual attribute. */
        is_team_plan: Attribute.get<number>((_v, attrs) => Number(attrs.seat_limit) > 5),

        /** Another read-only accessor combining several columns. */
        plan_summary: Attribute.get<unknown>(
            (_v, attrs) => `${attrs.seat_limit} seats · ${attrs.storage_quota_gb} GB`,
        ),

        /**
         * Mutator — normalises feature flags to lower-case on write. Pairs with
         * the "array" cast (this runs before the cast serialises to JSON).
         */
        feature_flags: Attribute.make<string[], string[]>({
            set: (value) =>
                Array.isArray(value) ? value.map((f) => String(f).toLowerCase().trim()) : value,
        }),
    };

    static override relations: Record<string, TRelationDefinition> = {
        workspace: {
            type: "belongsTo",
            model: () => Workspace,
            foreignKey: "workspace_id",
        },
    };

    static override scopes: Record<string, (q: QueryBuilder<WorkspaceSetting>) => void> = {
        /** `when()`-friendly scope — only rows with notifications on. */
        notifying: (q) => q.whereEq("notifications_enabled", true),
    };
}
