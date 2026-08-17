import type { Context } from "hono";

/**
 * Consistent JSON response envelopes — every endpoint returns either
 * `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.
 */
export function ok<T>(c: Context, data: T, status: 200 | 201 = 200) {
    return c.json({ ok: true as const, data }, status);
}

export function fail(
    c: Context,
    code: string,
    message: string,
    status: 400 | 401 | 403 | 404 | 409 | 422 | 500 = 400,
) {
    return c.json({ ok: false as const, error: { code, message } }, status);
}

export function notFound(c: Context, resource: string) {
    return fail(c, "not_found", `${resource} not found`, 404);
}
