import { showcaseFeatures } from "../../utils/showcase/registry";
import { ensureDb } from "../../utils/db";
import { ok } from "../../utils/response";

/**
 * GET /api/features
 *
 * Runs all 14 beta.3 feature demos LIVE against D1 and returns, per feature:
 *   { number, key, feature, whatItShows, snippet, result }
 *
 * Each loader reseeds its own dedicated `feat_*` fixtures first, so results are
 * deterministic and independent of the `acme` domain seed. A single feature
 * that throws is reported in-band (its `error` field) rather than failing the
 * whole page.
 */
export default defineEventHandler(async (event) => {
    const env = ensureDb(event);

    const features = [];
    for (const f of showcaseFeatures) {
        const base = {
            number: f.number,
            key: f.key,
            feature: f.feature,
            whatItShows: f.whatItShows,
            snippet: f.snippet,
        };
        try {
            const result = await f.run(env);
            features.push({ ...base, result });
        } catch (e) {
            features.push({ ...base, error: e instanceof Error ? e.message : String(e) });
        }
    }

    return ok(event, {
        count: features.length,
        note: "Every result is computed live against D1 via @orphnet/d1-eloquent. Call GET /api/features/:key for one in isolation.",
        features,
    });
});
