import { Hono } from "hono";
import { AuditEvent, Workspace } from "../models";
import { fail, notFound, ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const ledgerRoutes = new Hono<AppEnv>();

/**
 * POST /api/ledger/:slug/events
 * RETURNING + generated columns. Inserts an audit event and reads the
 * database-computed `severity_rank` (STORED), `event_label` (VIRTUAL), and
 * `amount_dollars` (STORED) back in the same round-trip via insertReturning().
 */
ledgerRoutes.post("/:slug/events", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const body = await c.req.json<{
        actor_id?: string;
        action?: string;
        resource_type?: string;
        resource_id?: string;
        severity?: string;
        amount_cents?: number;
    }>();
    if (!body.action || !body.resource_type || !body.resource_id) {
        return fail(c, "validation", "action, resource_type, resource_id are required", 422);
    }

    const now = new Date().toISOString();
    // insertReturning gives back the row *including* the generated columns, which
    // we never write ourselves — SQLite computes them.
    const row = await AuditEvent.query().insertReturning(
        {
            id: crypto.randomUUID(),
            workspace_id: ws.get("id"),
            actor_id: body.actor_id ?? null,
            action: body.action,
            resource_type: body.resource_type,
            resource_id: body.resource_id,
            severity: body.severity ?? "info",
            amount_cents: body.amount_cents ?? 0,
            occurred_at: now,
            created_at: now,
            updated_at: now,
        },
        ["id", "event_label", "severity_rank", "amount_dollars", "severity"],
    );

    return ok(c, { event: row }, 201);
});

/**
 * PATCH /api/ledger/:slug/events/escalate
 * updateReturning — bump every 'warning' to 'error' and return the affected
 * rows with their recomputed generated columns. (severity_rank/event_label
 * change because severity changed.)
 */
ledgerRoutes.patch("/:slug/events/escalate", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const updated = await AuditEvent.query()
        .whereEq("workspace_id", ws.get("id"))
        .whereEq("severity", "warning")
        .updateReturning({ severity: "error", updated_at: new Date().toISOString() }, [
            "id",
            "severity",
            "severity_rank",
            "event_label",
        ]);

    return ok(c, { escalated: updated.length, rows: updated });
});

/**
 * DELETE /api/ledger/:slug/events/info
 * deleteReturning — prune low-severity noise and return what was removed.
 */
ledgerRoutes.delete("/:slug/events/info", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const removed = await AuditEvent.query()
        .whereEq("workspace_id", ws.get("id"))
        .whereEq("severity", "info")
        .deleteReturning(["id", "event_label"]);

    return ok(c, { deleted: removed.length, rows: removed });
});

/**
 * POST /api/ledger/:slug/events/bulk
 * Batch ops: insertMany for a single-statement bulk insert. (createMany — which
 * also runs hooks/casts — is exercised by the seeder; insertMany is the lighter
 * raw-row path shown here.)
 */
ledgerRoutes.post("/:slug/events/bulk", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");
    const wsId = ws.get("id");

    const body = await c.req.json<{ events?: Array<Record<string, unknown>> }>();
    const incoming = Array.isArray(body.events) ? body.events : [];
    if (incoming.length === 0) {
        return fail(c, "validation", "events[] is required", 422);
    }

    const now = new Date().toISOString();
    const rows = incoming.map((e) => ({
        id: crypto.randomUUID(),
        workspace_id: wsId,
        actor_id: (e.actor_id as string) ?? null,
        action: String(e.action ?? "bulk.event"),
        resource_type: String(e.resource_type ?? "system"),
        resource_id: String(e.resource_id ?? "n/a"),
        severity: String(e.severity ?? "info"),
        amount_cents: Number(e.amount_cents ?? 0),
        occurred_at: now,
        created_at: now,
        updated_at: now,
    }));

    await AuditEvent.query().insertMany(rows);

    return ok(c, { inserted: rows.length }, 201);
});

/**
 * GET /api/ledger/:slug/events
 * List recent events ordered by the STORED generated `severity_rank`.
 */
ledgerRoutes.get("/:slug/events", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const events = await AuditEvent.query()
        .whereEq("workspace_id", ws.get("id"))
        .with(["actor"])
        .orderBy("severity_rank", "desc")
        .orderBy("occurred_at", "desc")
        .limit(50)
        .get();

    return ok(c, events.map((e) => e.toJSON()));
});
