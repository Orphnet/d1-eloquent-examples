import { KvCacheAdapter } from "@orphnet/d1-eloquent";
import type { Bindings } from "./env";

/**
 * Build a `KvCacheAdapter` scoped to this app's namespace and a 5-minute
 * default TTL. We also pass an `invalidationKey` that nukes the canonical
 * key plus a `<table>:list` aggregate cache on every write, so list
 * endpoints stay fresh after mutations.
 */
export function buildCache(env: Bindings): KvCacheAdapter {
    return new KvCacheAdapter(env.CACHE, {
        prefix: "d1e-example:",
        defaultTtl: 300,
        invalidationKey: (e) => [
            `d1e-example:${e.table}:${e.id}`,
            `d1e-example:${e.table}:list`,
        ],
    });
}
