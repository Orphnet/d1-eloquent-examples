import { Post } from "../models";
import { ensureDb } from "../utils/db";
import { fail, ok } from "../utils/response";

/**
 * GET /api/search?q=<terms>&limit=<n>
 *
 * FTS5 full-text search via the `posts_search` virtual table.
 * `.withTrashed()` is required so Post's soft-delete scope doesn't emit
 * a `WHERE deleted_at IS NULL` against the FTS5 virtual table (which
 * has no such column).
 */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const q = getQuery(event).q as string | undefined;
    if (!q || q.trim().length === 0) {
        return fail(event, "validation", "q query parameter is required", 422);
    }
    const limit = Math.min(50, Math.max(1, Number(getQuery(event).limit ?? 20)));

    const hits = await Post.query()
        .from("posts_search")
        .withTrashed()
        .selectRaw("rowid")
        .whereMatch("posts_search", q)
        .orderByRank("asc")
        .limit(limit)
        .pluck("rowid");

    if (hits.length === 0) {
        return ok(event, { query: q, hits: [] });
    }

    const posts = await Post.query()
        .whereRaw(`rowid IN (${hits.map(() => "?").join(", ")})`, hits)
        .with(["author"])
        .get();

    return ok(event, {
        query: q,
        hits: posts.map((p) => p.toJSON()),
    });
});
