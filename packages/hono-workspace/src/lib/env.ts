/**
 * Cloudflare Workers bindings declared on the `Env` passed to `fetch()`.
 *
 * Keep this in sync with the bindings in `wrangler.jsonc` — the route
 * handlers read these via Hono's `c.env` accessor.
 */
export type Bindings = {
    /** Primary D1 database — matches the `binding` in wrangler.jsonc. */
    DB: D1Database;

    /** Cloudflare KV namespace used as a read-through cache. */
    CACHE: KVNamespace;

    /** Human-readable app name surfaced in API responses. */
    APP_NAME: string;
};

export type AppEnv = { Bindings: Bindings };
