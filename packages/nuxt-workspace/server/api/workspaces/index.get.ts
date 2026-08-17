import { Workspace } from "../../models";
import { buildCache, ensureDb } from "../../utils/db";
import { ok } from "../../utils/response";

/** GET /api/workspaces — list (KV-cached for 60s). */
export default defineEventHandler(async (event) => {
    const env = ensureDb(event);
    const cache = buildCache(env);
    const list = await cache.remember("workspaces:list", 60, async () => {
        const rows = await Workspace.query().orderBy("name").get();
        return rows.map((w) => w.toObject());
    });
    return ok(event, list);
});
