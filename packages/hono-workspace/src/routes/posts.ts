import { Hono } from "hono";
import { ActivityEvent, Post, Workspace } from "../models";
import { fail, notFound, ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const postRoutes = new Hono<AppEnv>();

/** Cursor-paginated list of published posts in a workspace. */
postRoutes.get("/:slug/posts", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const after = c.req.query("after");
    const perPage = Number(c.req.query("perPage") ?? 10);

    const page = await Post.query()
        .scoped("published")
        .whereEq("workspace_id", ws.get("id"))
        .with(["author", "tags"])
        .withCount("comments")
        .paginateCursor({
            orderBy: "published_at",
            direction: "desc",
            perPage,
            ...(after ? { after } : {}),
        });

    return ok(c, {
        data: page.data.map((p) => {
            const json = p.toJSON();
            return { ...json, comments_count: json.comments_count };
        }),
        nextCursor: page.nextCursor,
        prevCursor: page.prevCursor,
        hasMore: page.hasMore,
    });
});

/** Fetch a single post by slug; bumps view_count atomically. */
postRoutes.get("/:slug/posts/:postSlug", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const post = await Post.query()
        .whereEq("workspace_id", ws.get("id"))
        .whereEq("slug", c.req.param("postSlug"))
        .with(["author", "tags", "attachments", "comments"])
        .first();
    if (!post) return notFound(c, "post");

    // Bump view_count via a direct UPDATE — atomic, doesn't churn revisions
    await Post.query()
        .whereEq("id", post.get("id"))
        .update({ view_count: post.get("view_count") + 1 });

    return ok(c, post.toJSON());
});

/** Create a draft post. */
postRoutes.post("/:slug/posts", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const body = await c.req.json<{
        author_id?: string;
        slug?: string;
        title?: string;
        body?: string;
        metadata?: Record<string, unknown>;
    }>();
    if (!body.author_id || !body.slug || !body.title || !body.body) {
        return fail(c, "validation", "author_id, slug, title, body all required", 422);
    }

    const post = await Post.create(
        {
            id: crypto.randomUUID(),
            workspace_id: ws.get("id"),
            author_id: body.author_id,
            slug: body.slug,
            title: body.title,
            body: body.body,
            status: "draft" as const,
            metadata: body.metadata ?? null,
            published_at: null,
            view_count: 0,
        },
        {
            revision: { actorId: body.author_id, reason: "post drafted" },
        },
    );

    await ActivityEvent.create({
        id: crypto.randomUUID(),
        workspace_id: ws.get("id"),
        actor_id: body.author_id,
        verb: "post.drafted",
        subject_type: "post",
        subject_id: post.get("id"),
        payload: { title: body.title },
    });

    return ok(c, post.toObject(), 201);
});

/** Publish a post — flips status + sets published_at. */
postRoutes.post("/:slug/posts/:postSlug/publish", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const post = await Post.query()
        .whereEq("workspace_id", ws.get("id"))
        .whereEq("slug", c.req.param("postSlug"))
        .first();
    if (!post) return notFound(c, "post");

    post.fill({ status: "published", published_at: new Date().toISOString() });
    await post.save({ revision: { reason: "post published" } });

    await ActivityEvent.create({
        id: crypto.randomUUID(),
        workspace_id: ws.get("id"),
        actor_id: post.get("author_id"),
        verb: "post.published",
        subject_type: "post",
        subject_id: post.get("id"),
        payload: { title: post.get("title") },
    });

    return ok(c, post.toObject());
});
