import { Hono } from "hono";
import { MetricSnapshot, Project, Workspace, WorkspaceSetting } from "../models";
import { fail, notFound, ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const jsonRoutes = new Hono<AppEnv>();

/**
 * GET /api/json/:slug/settings
 * Return the workspace settings row. Demonstrates the model's `appends`
 * (theme_label, flag_count) and `hidden` (webhook_secret) in `toJSON()`.
 */
jsonRoutes.get("/:slug/settings", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const settings = await WorkspaceSetting.query()
        .whereEq("workspace_id", ws.get("id"))
        .first();
    if (!settings) return notFound(c, "workspace settings");

    // toJSON() runs accessors, injects appends, and strips hidden fields.
    return ok(c, settings.toJSON());
});

/**
 * GET /api/json/:slug/settings/search
 * JSON *query* helpers over the `prefs` (object) and `feature_flags` (array)
 * columns. Query string knobs:
 *   ?role=admin            → whereJsonPath('prefs', '$.role', '=', 'admin')
 *   ?flag=beta-search      → whereJsonContains('feature_flags', 'beta-search')
 *   ?minFlags=2            → whereJsonLength('feature_flags', '>=', 2)
 * Also projects a couple of extracted JSON paths via selectJsonExtract and
 * orders by a nested JSON path with orderByJsonPath.
 */
jsonRoutes.get("/:slug/settings/search", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const role = c.req.query("role");
    const flag = c.req.query("flag");
    const minFlags = c.req.query("minFlags");

    const rows = await WorkspaceSetting.query()
        .whereEq("workspace_id", ws.get("id"))
        // Pull nested JSON values out into named columns.
        .selectJsonExtract("prefs", "$.role", "role")
        .selectJsonExtract("prefs", "$.notifications.email", "email_notifications")
        // Conditionally apply JSON predicates using when() — only filter when
        // the corresponding query param is present.
        .when(role, (q, value) => q.whereJsonPath("prefs", "$.role", "=", value))
        .when(flag, (q, value) => q.whereJsonContains("feature_flags", value))
        .when(minFlags, (q, value) =>
            q.whereJsonLength("feature_flags", ">=", Number(value)),
        )
        // Order by a JSON path inside `prefs`.
        .orderByJsonPath("prefs", "$.priority", "desc")
        .get();

    return ok(c, {
        count: rows.length,
        rows: rows.map((r) => r.toJSON()),
    });
});

/**
 * PATCH /api/json/:slug/settings
 * JSON *in-place* updates — no read-modify-write round trip. Body knobs:
 *   { "set": { "path": "$.role", "value": "owner" } } → updateJsonSet
 *   { "patch": { "theme": "dark", "density": "compact" } } → updateJsonPatch (RFC 7396 merge)
 *   { "remove": ["$.legacy", "$.tmp"] }               → updateJsonRemove
 */
jsonRoutes.patch("/:slug/settings", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");
    const wsId = ws.get("id");

    const body = await c.req.json<{
        set?: { path: string; value: unknown };
        patch?: Record<string, unknown>;
        remove?: string | string[];
    }>();

    const applied: string[] = [];

    if (body.set) {
        await WorkspaceSetting.query()
            .whereEq("workspace_id", wsId)
            .updateJsonSet("prefs", body.set.path, body.set.value);
        applied.push("updateJsonSet");
    }
    if (body.patch) {
        await WorkspaceSetting.query()
            .whereEq("workspace_id", wsId)
            .updateJsonPatch("prefs", body.patch);
        applied.push("updateJsonPatch");
    }
    if (body.remove) {
        await WorkspaceSetting.query()
            .whereEq("workspace_id", wsId)
            .updateJsonRemove("prefs", body.remove);
        applied.push("updateJsonRemove");
    }

    if (applied.length === 0) {
        return fail(c, "validation", "provide at least one of: set, patch, remove", 422);
    }

    const fresh = await WorkspaceSetting.query().whereEq("workspace_id", wsId).first();
    return ok(c, { applied, settings: fresh?.toJSON() ?? null });
});

/**
 * GET /api/json/:slug/metrics/aggregate
 * JSON *aggregate* helpers. Rolls every snapshot for the workspace's projects
 * into:
 *   - json_group_array of visit counts per project  (selectJsonGroupArray)
 *   - json_group_object of captured_on → visits      (selectJsonGroupObject)
 */
jsonRoutes.get("/:slug/metrics/aggregate", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const projectIds = Project.query()
        .select(["id"])
        .whereEq("workspace_id", ws.get("id"));

    const rows = await MetricSnapshot.query()
        .select(["project_id"])
        .whereIn("project_id", projectIds)
        // Array of all visit counts seen for the project.
        .selectJsonGroupArray("visits", "visit_series")
        // Map of capture date → visits for the project.
        .selectJsonGroupObject("captured_on", "visits", "by_day")
        .selectRaw("SUM(visits) AS total_visits")
        .groupBy("project_id")
        .get();

    // These are raw aggregate rows (not full models) — return the underlying
    // attribute bags. json_group_* columns come back as JSON strings.
    return ok(c, {
        projects: rows.map((r) => {
            // These rows carry json_group_*/selectRaw aggregate columns that
            // aren't on MetricSnapshotAttrs — read them off the untyped JSON view.
            const o = r.toJSON();
            return {
                project_id: o.project_id,
                total_visits: o.total_visits,
                visit_series: JSON.parse(String(o.visit_series ?? "[]")),
                by_day: JSON.parse(String(o.by_day ?? "{}")),
            };
        }),
    });
});
