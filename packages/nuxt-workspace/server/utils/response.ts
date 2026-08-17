import type { H3Event } from "h3";

export function ok<T>(_event: H3Event, data: T, status = 200) {
    setResponseStatus(_event, status);
    return { ok: true as const, data };
}

export function fail(event: H3Event, code: string, message: string, status = 400) {
    setResponseStatus(event, status);
    return { ok: false as const, error: { code, message } };
}

export function notFound(event: H3Event, what: string) {
    return fail(event, "not_found", `No such ${what}`, 404);
}
