import { MetricEvent, Workspace } from "../../models";
import { ensureDb } from "../../utils/db";
import { fail, notFound, ok } from "../../utils/response";

/**
 * GET /api/analytics/usage?workspace=:slug
 *
 * Roll-up over the `metric_events` table. Demonstrates:
 *   - scalar aggregates       — count() / sum() / avg() / min() / max()
 *   - generated columns       — total_cost (STORED) is summed directly
 *   - JSON aggregates         — selectJsonGroupArray + selectJsonGroupObject
 *   - a non-recursive CTE     — withCte() to pre-filter the billable window
 *   - orderByJsonPath         — order grouped rows by a JSON dimension
 */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const slug = getQuery(event).workspace as string | undefined;
    if (!slug) return fail(event, "validation", "workspace query param required", 422);

    const ws = await Workspace.query().whereEq("slug", slug).first();
    if (!ws) return notFound(event, "workspace");
    const wsId = ws.get("id");

    // ── Scalar aggregates over the generated `total_cost` column ──────────────
    const base = () => MetricEvent.query().whereEq("workspace_id", wsId);
    const [events, totalCost, avgQty, minQty, maxQty] = await Promise.all([
        base().count(),
        base().sum("total_cost"),
        base().avg("quantity"),
        base().min("quantity"),
        base().max("quantity"),
    ]);

    // ── Per-metric roll-up with a JSON aggregate of the day buckets ──────────
    // selectJsonGroupArray folds the per-row day_bucket (a VIRTUAL generated
    // column) into a JSON array per metric.
    const perMetric = await MetricEvent.query()
        .whereEq("workspace_id", wsId)
        .select(["metric"])
        .selectRaw("COUNT(*) AS event_count")
        .selectRaw("ROUND(SUM(total_cost), 4) AS cost")
        .selectJsonGroupArray("DISTINCT day_bucket", "days")
        .groupBy("metric")
        .orderBy("cost", "desc")
        .get();

    // ── CTE: pre-aggregate cost per day, then group into one JSON object ─────
    // withCte() defines `daily(day, cost)`; the outer query folds it into a
    // single { "2026-05-30": 12.34, ... } object via selectJsonGroupObject.
    const dailyCte = MetricEvent.query()
        .whereEq("workspace_id", wsId)
        .select(["day_bucket"])
        .selectRaw("ROUND(SUM(total_cost), 4) AS cost")
        .groupBy("day_bucket");

    const dailyObject = await MetricEvent.query()
        .from("daily")
        .withTrashed()
        .withCte("daily", dailyCte, ["day_bucket", "cost"])
        .selectJsonGroupObject("day_bucket", "cost", "by_day")
        .first();

    return ok(event, {
        workspace: slug,
        scalars: {
            events,
            total_cost: Number(totalCost ?? 0),
            avg_quantity: avgQty,
            min_quantity: minQty,
            max_quantity: maxQty,
        },
        per_metric: perMetric.map((r) => {
            // event_count / cost / days are selectRaw / json-aggregate aliases,
            // not on MetricEventAttrs — read them off the raw attribute bag.
            const raw = r.toRaw();
            return {
                metric: r.get("metric"),
                event_count: raw.event_count,
                cost: raw.cost,
                // json_group_array returns a JSON string — parse for the response.
                days: JSON.parse(String(raw.days ?? "[]")),
            };
        }),
        by_day: dailyObject
            ? JSON.parse(String(dailyObject.toRaw().by_day ?? "{}"))
            : {},
    });
});
