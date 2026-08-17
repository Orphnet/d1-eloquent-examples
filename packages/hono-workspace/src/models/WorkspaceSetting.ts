import { BaseModel, Attribute } from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

import { Workspace } from "./Workspace";

export type WorkspaceSettingTheme = "system" | "light" | "dark";

interface WorkspaceSettingAttrs {
    id: string;
    workspace_id: string;
    /** Free-form nested preferences — exercised by the JSON query/update helpers. */
    prefs: Record<string, unknown> | null;
    /** A JSON *array* of enabled feature flags — cast: 'array'. */
    feature_flags: string[];
    /** Secret signing key — hidden from default serialization. */
    webhook_secret: string | null;
    theme: WorkspaceSettingTheme;
    created_at?: Date;
    updated_at?: Date;
}

type WorkspaceSettingRelations = {
    workspace: Workspace | null;
};

/**
 * One settings row per workspace. This model is the showcase for:
 *
 *  - casts: `json` (prefs/breakdown), `array` (feature_flags)
 *  - accessors (read transforms) + mutators (write transforms) via `Attribute`
 *  - `appends` — accessor-only virtual attributes added to `toJSON()`
 *  - `hidden` — secret fields stripped from `toJSON()`
 */
export class WorkspaceSetting extends BaseModel<
    WorkspaceSettingAttrs,
    { theme_label: string; flag_count: number },
    WorkspaceSettingRelations
> {
    static table = "workspace_settings";
    static guarded = [];
    static casts = { prefs: "json", feature_flags: "array" } as const;

    /** Never leak the webhook secret in API responses. */
    static hidden = ["webhook_secret"];

    /** Virtual, accessor-backed attributes added to every `toJSON()`. */
    static appends = ["theme_label", "flag_count"];

    static accessors = {
        // Accessor — read transform. Builds a human label from `theme`.
        theme_label: Attribute.get((_value: unknown, attrs: Record<string, unknown>) => {
            const theme = String(attrs.theme ?? "system");
            return theme.charAt(0).toUpperCase() + theme.slice(1) + " theme";
        }),
        // Accessor — derive a count from the JSON array. `feature_flags` is the
        // already-cast array at read time.
        flag_count: Attribute.get((_value: unknown, attrs: Record<string, unknown>) => {
            const flags = attrs.feature_flags;
            return Array.isArray(flags) ? flags.length : 0;
        }),
        // Mutator — write transform. Normalise theme to lower-case on the way in.
        theme: Attribute.set((value: unknown) => String(value ?? "system").toLowerCase()),
    };

    static relations: Record<string, TRelationDefinition> = {
        workspace: {
            type: "belongsTo",
            model: () => Workspace,
            foreignKey: "workspace_id",
        },
    };

    static scopes: Record<string, (q: QueryBuilder<WorkspaceSetting>) => void> = {
        dark: (q) => q.whereEq("theme", "dark"),
    };
}
