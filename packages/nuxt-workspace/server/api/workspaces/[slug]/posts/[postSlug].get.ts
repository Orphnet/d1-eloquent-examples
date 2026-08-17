import { Post } from "../../../../models";
import { ensureDb } from "../../../../utils/db";
import { notFound, ok } from "../../../../utils/response";

/**
 * GET /api/workspaces/:slug/posts/:postSlug
 *
 * Bumps `view_count` via an atomic UPDATE — doesn't churn revisions.
 */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const postSlug = getRouterParam(event, "postSlug");
    const post = await Post.query()
        .whereEq("slug", postSlug!)
        .with(["author", "tags"])
        .first();
    if (!post) return notFound(event, "post");

    await Post.query()
        .whereEq("id", post.get("id"))
        .update({ view_count: post.get("view_count") + 1 });

    post.set("view_count", post.get("view_count") + 1);
    return ok(event, post.toJSON());
});
