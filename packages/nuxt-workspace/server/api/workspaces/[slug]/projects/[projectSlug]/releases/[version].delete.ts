import { Project, Release, Workspace } from "../../../../../../models";
import { ensureDb } from "../../../../../../utils/db";
import { notFound, ok } from "../../../../../../utils/response";

/**
 * DELETE /api/workspaces/:slug/projects/:projectSlug/releases/:version
 *
 * Demonstrates deleteReturning() — delete rows and get the deleted rows back
 * in one round-trip (handy for confirmations / outbox events without a
 * preceding SELECT).
 */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const slug = getRouterParam(event, "slug");
    const projectSlug = getRouterParam(event, "projectSlug");
    const version = getRouterParam(event, "version");

    const ws = await Workspace.query().whereEq("slug", slug!).first();
    if (!ws) return notFound(event, "workspace");

    const project = await Project.query()
        .whereEq("workspace_id", ws.get("id"))
        .whereEq("slug", projectSlug!)
        .first();
    if (!project) return notFound(event, "project");

    const removed = await Release.query()
        .whereEq("project_id", project.get("id"))
        .whereEq("version", version!)
        .deleteReturning(["id", "version", "channel", "downloads"]);

    return ok(event, { deleted: removed.length, rows: removed });
});
