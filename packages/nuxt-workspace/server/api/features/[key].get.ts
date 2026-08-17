import { findShowcaseFeature } from "../../utils/showcase/registry";
import { ensureDb } from "../../utils/db";
import { fail, ok } from "../../utils/response";

/**
 * GET /api/features/:key
 *
 * Runs a SINGLE beta.3 feature demo live and returns its
 * { number, key, feature, whatItShows, snippet, result }. Keys are listed by
 * GET /api/features (e.g. `increment-decrement`, `has-many-through`).
 */
export default defineEventHandler(async (event) => {
    const env = ensureDb(event);
    const key = getRouterParam(event, "key");
    const feature = key ? findShowcaseFeature(key) : undefined;
    if (!feature) return fail(event, "not_found", `No such feature '${key}'`, 404);

    const result = await feature.run(env);
    return ok(event, {
        number: feature.number,
        key: feature.key,
        feature: feature.feature,
        whatItShows: feature.whatItShows,
        snippet: feature.snippet,
        result,
    });
});
