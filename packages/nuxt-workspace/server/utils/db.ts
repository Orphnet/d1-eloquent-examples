/// <reference types="@cloudflare/workers-types" />
import type { H3Event } from "h3";
import { configure } from "@orphnet/d1-eloquent";
import { KvCacheAdapter } from "@orphnet/d1-eloquent";

let configured = false;

/**
 * Wire the runtime D1 binding into d1-eloquent. Idempotent — safe to call
 * from every request handler. Pulls the Cloudflare bindings off the
 * Nuxt event's `context.cloudflare.env` shape that `nitro-cloudflare-dev`
 * (locally) and the `cloudflare_module` preset (deployed) both expose.
 */
export function ensureDb(event: H3Event): Env {
    const env = event.context.cloudflare?.env as unknown as Env | undefined;
    if (!env) {
        throw createError({
            statusCode: 500,
            statusMessage: "Cloudflare bindings unavailable on event.context",
        });
    }
    if (!configured) {
        configure(env as unknown as Record<string, unknown>);
        configured = true;
    }
    return env;
}

/** Build a KV-backed cache adapter for the current request's KV binding. */
export function buildCache(env: Env) {
    return new KvCacheAdapter(env.CACHE, { prefix: "d1e:nuxt:" });
}

/** Cloudflare bindings, augments the auto-generated `Env` from worker-configuration.d.ts. */
declare global {
    interface Env {
        DB: D1Database;
        CACHE: KVNamespace;
        APP_NAME: string;
    }
}
