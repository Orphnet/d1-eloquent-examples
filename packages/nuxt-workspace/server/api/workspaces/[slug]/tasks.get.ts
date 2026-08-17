import { Project, Task, Workspace } from "../../../models";
import { ensureDb } from "../../../utils/db";
import { notFound, ok } from "../../../utils/response";

/**
 * GET /api/workspaces/:slug/tasks
 *   ?status=open|in_progress|done|cancelled
 *   ?project_id=<uuid>
 *
 * Eager-loads assignee + tags (morphToMany). When no `status` is given,
 * defaults to the `open` scope (open + in_progress).
 */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const slug = getRouterParam(event, "slug");
    const ws = await Workspace.query().whereEq("slug", slug!).first();
    if (!ws) return notFound(event, "workspace");

    const q = getQuery(event);
    const status = q.status as string | undefined;
    const projectId = q.project_id as string | undefined;

    const qb = Task.query()
        .whereIn(
            "project_id",
            Project.query().select(["id"]).whereEq("workspace_id", ws.get("id")),
        )
        .with(["assignee", "tags"])
        .orderBy("priority", "desc")
        .orderBy("created_at", "desc");

    if (status) qb.whereEq("status", status);
    else qb.scoped("open");
    if (projectId) qb.whereEq("project_id", projectId);

    const tasks = await qb.get();
    return ok(event, tasks.map((t) => t.toJSON()));
});
