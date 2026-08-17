import { Task } from "../../../../../models";
import { ensureDb } from "../../../../../utils/db";
import { notFound, ok } from "../../../../../utils/response";

/** GET /api/audit/tasks/:id/asof/:ts — time-travel reconstruction. */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const id = getRouterParam(event, "id");
    const ts = getRouterParam(event, "ts");
    if (!id || !ts) return notFound(event, "task");
    const past = await Task.asOf(id, ts);
    if (!past) return notFound(event, `task at ${ts}`);
    return ok(event, past.toObject());
});
