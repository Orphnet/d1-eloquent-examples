import { Hono } from "hono";
import type { Context } from "hono";
import { Comment, Post, Task } from "../models";
import { fail, notFound, ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const commentRoutes = new Hono<AppEnv>();

/**
 * Post a comment on a task. Demonstrates the polymorphic morphTo /
 * morphMany pair — Comment.commentable resolves to a Task here.
 */
commentRoutes.post("/:slug/tasks/:id/comments", async (c) => {
    const taskId = c.req.param("id");
    const task = await Task.find(taskId);
    if (!task) return notFound(c, "task");

    return createCommentFor(c, "task", taskId);
});

/** Post a comment on a post (the blog kind). */
commentRoutes.post("/:slug/posts/:id/comments", async (c) => {
    const postId = c.req.param("id");
    const post = await Post.find(postId);
    if (!post) return notFound(c, "post");

    return createCommentFor(c, "post", postId);
});

async function createCommentFor(c: Context<AppEnv>, type: "task" | "post", subjectId: string) {
    const body = await c.req.json<{ author_id?: string; body?: string }>();
    if (!body.author_id || !body.body) {
        return fail(c, "validation", "author_id and body required", 422);
    }

    const comment = await Comment.create({
        id: crypto.randomUUID(),
        author_id: body.author_id,
        body: body.body,
        commentable_type: type,
        commentable_id: subjectId,
        approved: true,
    });

    return ok(c, comment.toObject(), 201);
}
