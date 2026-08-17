import { ActivityEvent, Task, Workspace } from "../../../models";
import { ensureDb } from "../../../utils/db";
import { fail, notFound, ok } from "../../../utils/response";

/** POST /api/workspaces/:slug/tasks — create + record activity. */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const slug = getRouterParam(event, "slug");
    const ws = await Workspace.query().whereEq("slug", slug!).first();
    if (!ws) return notFound(event, "workspace");

    const body = await readBody<{
        project_id?: string;
        parent_id?: string;
        assignee_id?: string;
        title?: string;
        description?: string;
        priority?: number;
        due_at?: string;
    }>(event);

    if (!body.project_id || !body.title) {
        return fail(event, "validation", "project_id and title required", 422);
    }

    const task = await Task.create(
        {
            id: crypto.randomUUID(),
            project_id: body.project_id,
            parent_id: body.parent_id ?? null,
            assignee_id: body.assignee_id ?? null,
            title: body.title,
            description: body.description ?? null,
            status: "open" as const,
            priority: body.priority ?? 0,
            estimated_hours: null,
            due_at: body.due_at ?? null,
            completed_at: null,
        },
        { revision: { actorId: body.assignee_id, reason: "task created" } },
    );

    await ActivityEvent.create({
        id: crypto.randomUUID(),
        workspace_id: ws.get("id"),
        actor_id: body.assignee_id ?? null,
        verb: "task.created",
        subject_type: "task",
        subject_id: task.get("id"),
        payload: { title: body.title, project_id: body.project_id },
    });

    return ok(event, task.toObject(), 201);
});
