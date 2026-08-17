import { Hono } from "hono";
import { ActivityEvent, Workspace } from "../models";
import { fail, notFound, ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const feedRoutes = new Hono<AppEnv>();

/**
 * Cursor-paginated activity feed. `?workspace=<slug>` scopes to a workspace;
 * `?after=<cursor>` advances. Each event includes the actor + the
 * eager-resolved subject (Task or Post via morphTo).
 */
feedRoutes.get("/", async (c) => {
    const slug = c.req.query("workspace");
    if (!slug) return fail(c, "validation", "workspace query param required", 422);

    const ws = await Workspace.query().whereEq("slug", slug).first();
    if (!ws) return notFound(c, "workspace");

    const after = c.req.query("after");
    const perPage = Math.min(50, Math.max(1, Number(c.req.query("perPage") ?? 20)));

    const page = await ActivityEvent.query()
        .whereEq("workspace_id", ws.get("id"))
        .with(["actor", "subject"])
        .paginateCursor({
            orderBy: "created_at",
            direction: "desc",
            perPage,
            ...(after ? { after } : {}),
        });

    return ok(c, {
        data: page.data.map((e) => e.toJSON()),
        nextCursor: page.nextCursor,
        prevCursor: page.prevCursor,
        hasMore: page.hasMore,
    });
});
