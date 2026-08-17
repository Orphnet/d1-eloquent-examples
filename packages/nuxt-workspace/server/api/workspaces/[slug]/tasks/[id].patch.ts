import { Task } from "../../../../models";
import { ensureDb } from "../../../../utils/db";
import { notFound, ok } from "../../../../utils/response";

/** PATCH /api/workspaces/:slug/tasks/:id — revision-tracked update. */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const id = getRouterParam(event, "id");
    const task = await Task.find(id!);
    if (!task) return notFound(event, "task");

    const body = await readBody<Partial<{
        title: string;
        description: string;
        status: "open" | "in_progress" | "done" | "cancelled";
        priority: number;
        assignee_id: string | null;
        due_at: string | null;
    }>>(event);

    task.fill(body);
    await task.save({ revision: { reason: "task updated" } });

    return ok(event, task.toObject());
});
