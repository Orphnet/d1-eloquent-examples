import { Project, Workspace } from "../../../models";
import { ensureDb } from "../../../utils/db";
import { notFound, ok } from "../../../utils/response";

/** GET /api/workspaces/:slug/projects — list with task counts. */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const slug = getRouterParam(event, "slug");
    const ws = await Workspace.query().whereEq("slug", slug!).first();
    if (!ws) return notFound(event, "workspace");

    const projects = await Project.query()
        .whereEq("workspace_id", ws.get("id"))
        .withCount("tasks")
        .orderBy("name")
        .get();

    return ok(
        event,
        projects.map((p) => {
            const json = p.toJSON();
            return { ...json, tasks_count: json.tasks_count };
        }),
    );
});
