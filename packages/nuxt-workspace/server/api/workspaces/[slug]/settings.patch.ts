import { Workspace, WorkspaceSetting } from "../../../models";
import { ensureDb } from "../../../utils/db";
import { fail, notFound, ok } from "../../../utils/response";

/**
 * PATCH /api/workspaces/:slug/settings
 *
 * Body: { op: "set" | "patch" | "remove", path?, value?, patch?, paths? }
 *
 * In-place JSON updates that never rewrite the whole document:
 *   - op=set    → updateJsonSet(col, path, value)
 *   - op=patch  → updateJsonPatch(col, patchObject)   (RFC 7396 merge)
 *   - op=remove → updateJsonRemove(col, path | paths)
 *
 * All three return the affected row count.
 */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const slug = getRouterParam(event, "slug");
    const ws = await Workspace.query().whereEq("slug", slug!).first();
    if (!ws) return notFound(event, "workspace");
    const wsId = ws.get("id");

    const body = await readBody<{
        op?: "set" | "patch" | "remove";
        path?: string;
        value?: unknown;
        patch?: Record<string, unknown>;
        paths?: string | string[];
    }>(event);

    const base = () => WorkspaceSetting.query().whereEq("workspace_id", wsId);
    let affected = 0;

    switch (body?.op) {
        case "set":
            if (!body.path) return fail(event, "validation", "path is required for op=set", 422);
            affected = await base().updateJsonSet("preferences", body.path, body.value ?? null);
            break;
        case "patch":
            if (!body.patch) return fail(event, "validation", "patch object is required for op=patch", 422);
            affected = await base().updateJsonPatch("preferences", body.patch);
            break;
        case "remove":
            if (!body.paths) return fail(event, "validation", "paths is required for op=remove", 422);
            affected = await base().updateJsonRemove("preferences", body.paths);
            break;
        default:
            return fail(event, "validation", "op must be one of set | patch | remove", 422);
    }

    const updated = await base().first();
    return ok(event, {
        op: body.op,
        affected,
        preferences: updated ? updated.get("preferences") : null,
    });
});
