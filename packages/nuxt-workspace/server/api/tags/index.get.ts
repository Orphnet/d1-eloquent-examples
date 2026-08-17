import { Tag } from "../../models";
import { ensureDb } from "../../utils/db";
import { ok } from "../../utils/response";

/** GET /api/tags — list all tags. */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const tags = await Tag.query().orderBy("label").get();
    return ok(event, tags.map((t) => t.toObject()));
});
