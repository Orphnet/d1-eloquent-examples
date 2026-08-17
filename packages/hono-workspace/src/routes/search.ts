import { Hono } from "hono";
import { Post } from "../models";
import { fail, ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const searchRoutes = new Hono<AppEnv>();

/**
 * FTS5 full-text search over the posts_search virtual table.
 * Query string: `?q=<terms>`. Optional `&limit=` (default 20).
 *
 * Demonstrates `qb.from()`, `whereMatch()`, and `orderByRank()`.
 */
searchRoutes.get("/", async (c) => {
    const q = c.req.query("q");
    if (!q || q.trim().length === 0) {
        return fail(c, "validation", "q query parameter is required", 422);
    }
    const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 20)));

    // Query the FTS5 virtual table by id, then hydrate posts via whereIn.
    // Note: `withTrashed()` disables Post's soft-delete scope so we don't
    // emit `WHERE deleted_at IS NULL` against the FTS5 virtual table, which
    // has no such column.
    const hits = await Post.query()
        .from("posts_search")
        .withTrashed()
        .selectRaw("rowid")
        .whereMatch("posts_search", q)
        .orderByRank("asc")
        .limit(limit)
        .pluck("rowid");

    if (hits.length === 0) {
        return ok(c, { query: q, hits: [] });
    }

    // posts_search uses external content with `content = posts` and
    // `content_rowid = rowid`; SQLite's implicit `rowid` on posts matches.
    const posts = await Post.query()
        .whereRaw(`rowid IN (${hits.map(() => "?").join(", ")})`, hits)
        .with(["author"])
        .get();

    return ok(c, {
        query: q,
        hits: posts.map((p) => p.toJSON()),
    });
});
