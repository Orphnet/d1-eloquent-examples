import { ActivityEvent, Workspace } from "../models";
import { ensureDb } from "../utils/db";
import { fail, notFound, ok } from "../utils/response";

/**
 * GET /api/feed?workspace=:slug&after=:cursor&perPage=:n
 *
 * Cursor-paginated activity feed. Each event has actor + the morphTo
 * subject (Task or Post) eager-resolved.
 */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const q = getQuery(event);
    const slug = q.workspace as string | undefined;
    if (!slug) return fail(event, "validation", "workspace query param required", 422);

    const ws = await Workspace.query().whereEq("slug", slug).first();
    if (!ws) return notFound(event, "workspace");

    const after = (q.after as string) || undefined;
    const perPage = Math.min(50, Math.max(1, Number(q.perPage ?? 20)));

    const page = await ActivityEvent.query()
        .whereEq("workspace_id", ws.get("id"))
        .with(["actor", "subject"])
        .paginateCursor({
            orderBy: "created_at",
            direction: "desc",
            perPage,
            ...(after ? { after } : {}),
        });

    return ok(event, {
        data: page.data.map((e) => e.toJSON()),
        nextCursor: page.nextCursor,
        prevCursor: page.prevCursor,
        hasMore: page.hasMore,
    });
});
