import { Comment, Task } from "../../../../../models";
import { ensureDb } from "../../../../../utils/db";
import { fail, notFound, ok } from "../../../../../utils/response";

/** POST /api/workspaces/:slug/tasks/:id/comments — morphMany comment on a Task. */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const id = getRouterParam(event, "id");
    const task = await Task.find(id!);
    if (!task) return notFound(event, "task");

    const body = await readBody<{ author_id?: string; body?: string }>(event);
    if (!body.author_id || !body.body) {
        return fail(event, "validation", "author_id and body required", 422);
    }

    const comment = await Comment.create({
        id: crypto.randomUUID(),
        author_id: body.author_id,
        body: body.body,
        commentable_type: "task",
        commentable_id: id!,
        approved: true,
    });

    return ok(event, comment.toObject(), 201);
});
