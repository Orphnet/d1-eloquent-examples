import { ModelRevision } from "@orphnet/d1-eloquent";
import { Post, Task } from "../../../models";
import { ensureDb } from "../../../utils/db";
import { fail, notFound, ok } from "../../../utils/response";

/** GET /api/audit/:type/:id — full revision history for a Task or Post. */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const type = getRouterParam(event, "type");
    const id = getRouterParam(event, "id");

    if (type !== "task" && type !== "post") {
        return fail(event, "validation", "type must be 'task' or 'post'", 422);
    }
    if (!id) return notFound(event, type);

    // Branch on `type` so each concrete model keeps its own `this` context.
    const exists =
        type === "task"
            ? await Task.query().withTrashed().whereEq("id", id).first()
            : await Post.query().withTrashed().whereEq("id", id).first();
    if (!exists) return notFound(event, type);

    const revisions = await ModelRevision.query()
        .whereEq("model_table", type === "task" ? "tasks" : "posts")
        .whereEq("model_id", id)
        .orderBy("created_at", "asc")
        .get();

    return ok(event, revisions.map((r) => r.toObject()));
});
