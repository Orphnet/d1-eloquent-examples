import { Post, Task } from "../../models";
import { ensureDb } from "../../utils/db";
import { fail, notFound, ok } from "../../utils/response";

/**
 * POST /api/tags/sync — replace the full set of tags on a Task or Post.
 * Body: `{ subject_type, subject_id, tag_ids: [...] }`.
 */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const body = await readBody<{
        subject_type?: "task" | "post";
        subject_id?: string;
        tag_ids?: string[];
    }>(event);
    if (!body.subject_type || !body.subject_id || !Array.isArray(body.tag_ids)) {
        return fail(event, "validation", "subject_type, subject_id, tag_ids required", 422);
    }

    const subject =
        body.subject_type === "task"
            ? await Task.find(body.subject_id)
            : await Post.find(body.subject_id);
    if (!subject) return notFound(event, body.subject_type);

    const result = await subject.related("tags").sync!(body.tag_ids);
    return ok(event, result);
});
