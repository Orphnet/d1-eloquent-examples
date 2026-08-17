import { Workspace, WorkspaceSetting } from "../../../models";
import { ensureDb } from "../../../utils/db";
import { notFound, ok } from "../../../utils/response";

/**
 * GET /api/workspaces/:slug/settings
 *   ?flag=<name>        — filter via whereJsonContains on the feature_flags array
 *   ?minSeats=<n>       — filter via whereJsonPath-style numeric compare
 *
 * Demonstrates the JSON query helpers and selectJsonExtract, plus the model's
 * accessors / appends (is_team_plan, plan_summary) and hidden field (brand_logo
 * never serialises). The casts (json / array / boolean / integer / real /
 * date / datetime) are applied automatically on hydrate.
 */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const slug = getRouterParam(event, "slug");
    const ws = await Workspace.query().whereEq("slug", slug!).first();
    if (!ws) return notFound(event, "workspace");
    const wsId = ws.get("id");

    const q = getQuery(event);
    const flag = q.flag as string | undefined;

    // selectJsonExtract — pull a nested preference into a flat column,
    // whereJsonPath — match a value at a JSON path,
    // whereJsonContains — array membership on feature_flags,
    // whereJsonLength — gate on the size of the flags array.
    const setting = await WorkspaceSetting.query()
        .whereEq("workspace_id", wsId)
        .selectRaw("*")
        .selectJsonExtract("preferences", "$.theme", "theme")
        .selectJsonExtract("preferences", "$.locale", "locale")
        .when(flag, (qb, value) => qb.whereJsonContains("feature_flags", value))
        .first();

    if (!setting) return notFound(event, "settings");

    // A second small query: workspaces whose preferences.theme is "dark"
    // and which carry at least one feature flag — pure JSON-helper showcase.
    const darkThemeCount = await WorkspaceSetting.query()
        .whereJsonPath("preferences", "$.theme", "=", "dark")
        .whereJsonLength("feature_flags", ">=", 1)
        .count();

    // toJSON() applies accessors, appends the virtuals, and strips `hidden`.
    // It also carries the selectJsonExtract aliases (`theme`, `locale`), which
    // aren't on WorkspaceSettingAttrs — read them off the serialized row.
    const json = setting.toJSON();
    return ok(event, {
        settings: json,
        // Raw extracted columns prove selectJsonExtract aliased into the row.
        extracted: {
            theme: json.theme ?? null,
            locale: json.locale ?? null,
        },
        dark_theme_workspaces: darkThemeCount,
    });
});
