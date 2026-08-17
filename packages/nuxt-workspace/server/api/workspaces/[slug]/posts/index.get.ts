import { Post, Workspace } from "../../../../models";
import { ensureDb } from "../../../../utils/db";
import { notFound, ok } from "../../../../utils/response";

/**
 * GET /api/workspaces/:slug/posts
 *   ?after=<cursor>  &perPage=<n>
 *
 * Cursor-paginated, opaque base64url cursor returned in `nextCursor`.
 */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const slug = getRouterParam(event, "slug");
    const ws = await Workspace.query().whereEq("slug", slug!).first();
    if (!ws) return notFound(event, "workspace");

    const q = getQuery(event);
    const after = (q.after as string) || undefined;
    const perPage = Math.min(50, Math.max(1, Number(q.perPage ?? 10)));

    const page = await Post.query()
        .whereEq("workspace_id", ws.get("id"))
        .whereEq("status", "published")
        .with(["author"])
        .paginateCursor({
            orderBy: "published_at",
            direction: "desc",
            perPage,
            ...(after ? { after } : {}),
        });

    return ok(event, {
        data: page.data.map((p) => p.toJSON()),
        nextCursor: page.nextCursor,
        prevCursor: page.prevCursor,
        hasMore: page.hasMore,
    });
});
