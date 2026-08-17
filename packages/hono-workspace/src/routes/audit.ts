import { Hono } from "hono";
import { ModelRevision } from "@orphnet/d1-eloquent";
import { Post, Task } from "../models";
import { fail, notFound, ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const auditRoutes = new Hono<AppEnv>();

/**
 * Return the revision history for a Task or Post. Demonstrates the shared
 * `model_revisions` table populated by Task & Post's `static revisions`
 * config.
 */
auditRoutes.get("/:type/:id", async (c) => {
    const type = c.req.param("type");
    const id = c.req.param("id");

    if (type !== "task" && type !== "post") {
        return fail(c, "validation", "type must be 'task' or 'post'", 422);
    }

    // Confirm the model exists (live or soft-deleted). Branch on `type` so each
    // concrete model class keeps its own `this` context for query().
    const exists =
        type === "task"
            ? await Task.query().withTrashed().whereEq("id", id).first()
            : await Post.query().withTrashed().whereEq("id", id).first();
    if (!exists) return notFound(c, type);

    const revisions = await ModelRevision.query()
        .whereEq("model_table", type === "task" ? "tasks" : "posts")
        .whereEq("model_id", id)
        .orderBy("created_at", "asc")
        .get();

    return ok(c, revisions.map((r) => r.toObject()));
});

/** Time-travel — return a Task as it existed at an ISO timestamp. */
auditRoutes.get("/tasks/:id/asof/:ts", async (c) => {
    const past = await Task.asOf(c.req.param("id"), c.req.param("ts"));
    if (!past) return notFound(c, `task at ${c.req.param("ts")}`);
    return ok(c, past.toObject());
});
