import { Hono } from "hono";
import { Post, Tag, Task } from "../models";
import { fail, notFound, ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const tagRoutes = new Hono<AppEnv>();

/** List tags, optionally scoped to a workspace via `?workspace_id`. */
tagRoutes.get("/", async (c) => {
    const wsId = c.req.query("workspace_id");
    const q = Tag.query().orderBy("label");
    if (wsId) q.whereEq("workspace_id", wsId);
    const tags = await q.get();
    return ok(c, tags.map((t) => t.toObject()));
});

/**
 * Attach a tag to a Task or Post — uses the morphToMany pivot helpers.
 * `subject_type` must be `"task"` or `"post"`.
 */
tagRoutes.post("/:id/attach", async (c) => {
    const tagId = c.req.param("id");
    const body = await c.req.json<{ subject_type?: "task" | "post"; subject_id?: string }>();
    if (!body.subject_type || !body.subject_id) {
        return fail(c, "validation", "subject_type and subject_id required", 422);
    }

    const subject =
        body.subject_type === "task"
            ? await Task.find(body.subject_id)
            : await Post.find(body.subject_id);
    if (!subject) return notFound(c, body.subject_type);

    const attached = await subject.related("tags").attach!(tagId);
    return ok(c, { attached });
});

/** Detach a tag from a Task or Post. */
tagRoutes.post("/:id/detach", async (c) => {
    const tagId = c.req.param("id");
    const body = await c.req.json<{ subject_type?: "task" | "post"; subject_id?: string }>();
    if (!body.subject_type || !body.subject_id) {
        return fail(c, "validation", "subject_type and subject_id required", 422);
    }

    const subject =
        body.subject_type === "task"
            ? await Task.find(body.subject_id)
            : await Post.find(body.subject_id);
    if (!subject) return notFound(c, body.subject_type);

    const detached = await subject.related("tags").detach!(tagId);
    return ok(c, { detached });
});

/**
 * Sync — replace the full set of tags on a Task or Post.
 * Body: `{ subject_type, subject_id, tag_ids: [...] }`.
 */
tagRoutes.post("/sync", async (c) => {
    const body = await c.req.json<{
        subject_type?: "task" | "post";
        subject_id?: string;
        tag_ids?: string[];
    }>();
    if (!body.subject_type || !body.subject_id || !Array.isArray(body.tag_ids)) {
        return fail(c, "validation", "subject_type, subject_id, tag_ids required", 422);
    }

    const subject =
        body.subject_type === "task"
            ? await Task.find(body.subject_id)
            : await Post.find(body.subject_id);
    if (!subject) return notFound(c, body.subject_type);

    const result = await subject.related("tags").sync!(body.tag_ids);
    return ok(c, result);
});
