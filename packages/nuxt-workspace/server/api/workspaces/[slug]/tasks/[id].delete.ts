import { Task } from "../../../../models";
import { ensureDb } from "../../../../utils/db";
import { notFound, ok } from "../../../../utils/response";

/** DELETE /api/workspaces/:slug/tasks/:id — soft-delete + revision row. */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const id = getRouterParam(event, "id");
    const task = await Task.find(id!);
    if (!task) return notFound(event, "task");

    await task.delete({ revision: { reason: "task removed" } });
    return ok(event, { deleted: true, id });
});
