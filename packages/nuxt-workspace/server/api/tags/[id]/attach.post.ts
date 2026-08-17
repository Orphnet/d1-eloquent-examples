import { Post, Task } from "../../../models";
import { ensureDb } from "../../../utils/db";
import { fail, notFound, ok } from "../../../utils/response";

/** POST /api/tags/:id/attach — pivot attach via morphToMany. */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const tagId = getRouterParam(event, "id");
    if (!tagId) return fail(event, "validation", "tag id is required", 422);
    const body = await readBody<{ subject_type?: "task" | "post"; subject_id?: string }>(event);
    if (!body.subject_type || !body.subject_id) {
        return fail(event, "validation", "subject_type and subject_id required", 422);
    }

    const subject =
        body.subject_type === "task"
            ? await Task.find(body.subject_id)
            : await Post.find(body.subject_id);
    if (!subject) return notFound(event, body.subject_type);

    const attached = await subject.related("tags").attach!(tagId);
    return ok(event, { attached });
});
