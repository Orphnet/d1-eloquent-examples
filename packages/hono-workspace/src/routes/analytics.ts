import { Hono } from "hono";
import {
    MetricSnapshot,
    Post,
    Project,
    Task,
    User,
    Workspace,
} from "../models";
import { fail, notFound, ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const analyticsRoutes = new Hono<AppEnv>();

/**
 * GET /api/analytics/:slug/summary
 * Scalar aggregates (count / sum / avg / min / max) computed directly in SQL,
 * plus per-project relation aggregates (withSum / withAvg / withCount) and
 * nested eager loading (.with(['tasks', 'tasks.assignee'])).
 */
analyticsRoutes.get("/:slug/summary", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");
    const wsId = ws.get("id");

    const projectIds = Project.query().select(["id"]).whereEq("workspace_id", wsId);

    // ── Scalar aggregates over tasks ────────────────────────────────────────
    const totalTasks = await Task.query().whereIn("project_id", projectIds).count();
    const totalHours = await Task.query()
        .whereIn("project_id", projectIds)
        .whereNotNull("estimated_hours")
        .sum("estimated_hours");
    const avgPriority = await Task.query().whereIn("project_id", projectIds).avg("priority");
    const minDue = await Task.query()
        .whereIn("project_id", projectIds)
        .whereNotNull("due_at")
        .min("due_at");
    const maxDue = await Task.query()
        .whereIn("project_id", projectIds)
        .whereNotNull("due_at")
        .max("due_at");

    // ── Relation aggregates per project ─────────────────────────────────────
    // withCount('tasks'), withSum('metrics','visits'), withAvg('metrics','conversion_rate')
    const projects = await Project.query()
        .whereEq("workspace_id", wsId)
        .withCount("tasks")
        .withSum("metrics", "visits")
        .withAvg("metrics", "conversion_rate")
        .with(["tasks.assignee"]) // nested eager loading (loads tasks + their assignees)
        .get();

    return ok(c, {
        tasks: {
            total: totalTasks,
            estimated_hours: totalHours,
            avg_priority: avgPriority,
            earliest_due: minDue,
            latest_due: maxDue,
        },
        projects: projects.map((p) => {
            // Nested eager load: Project's `tasks.assignee` eager loader loaded
            // each project's tasks AND each task's assignee onto the live model
            // instances. Read them straight off `.relations`.
            const loadedTasks = p.relations?.tasks ?? [];
            // Relation aggregates (withCount/withSum/withAvg) add columns that
            // aren't on the model's attribute interface — read them off toJSON().
            const json = p.toJSON();
            return {
                id: p.get("id"),
                name: p.get("name"),
                tasks_count: json.tasks_count,
                // Relation aggregates — default alias is `<relation>_<col>_<agg>`.
                metrics_visits_sum: json.metrics_visits_sum,
                metrics_conversion_rate_avg: json.metrics_conversion_rate_avg,
                sample_assignees: loadedTasks.slice(0, 3).map((t) => {
                    // `load()` stores a belongsTo result as a one-element
                    // collection; unwrap it and read the name off the model.
                    const rel = t.relations?.assignee;
                    const assignee = Array.isArray(rel) ? rel[0] : rel;
                    if (!assignee) return null;
                    return assignee.get("name") ?? null;
                }),
            };
        }),
    });
});

/**
 * GET /api/analytics/:slug/top-contributors
 * Non-recursive CTE (withCte): rank users by authored posts, then join back.
 * Demonstrates building a sub-query QueryBuilder and referencing the CTE by name.
 */
analyticsRoutes.get("/:slug/top-contributors", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");
    const wsId = ws.get("id");

    // CTE body: post counts per author within this workspace.
    const postCounts = Post.query()
        .select(["author_id"])
        .selectRaw("COUNT(*) AS post_count")
        .whereEq("workspace_id", wsId)
        .groupBy("author_id");

    const contributors = await User.query()
        .withCte("post_counts", postCounts)
        .join("post_counts", "post_counts.author_id = users.id")
        .selectRaw("users.id AS id, users.name AS name, post_counts.post_count AS post_count")
        .orderBy("post_count", "desc")
        .limit(10)
        .get();

    return ok(c, {
        contributors: contributors.map((u) => {
            // selectRaw added `post_count`, which isn't on UserAttrs — use the
            // untyped JSON view to read the computed aggregate.
            const o = u.toJSON();
            return { id: o.id, name: o.name, post_count: o.post_count };
        }),
    });
});

/**
 * GET /api/analytics/tasks/:id/tree
 * Recursive CTE (withRecursive): walk a task's subtask tree to arbitrary depth.
 * The recursive member unions child rows by parent_id.
 */
analyticsRoutes.get("/tasks/:id/tree", async (c) => {
    const rootId = c.req.param("id");
    const root = await Task.find(rootId);
    if (!root) return notFound(c, "task");

    // Anchor member: the root task at depth 0.
    const anchor = Task.query()
        .selectRaw("id, parent_id, title, 0 AS depth")
        .whereEq("id", rootId);

    // Recursive member: children of anything already in `subtree`, depth + 1.
    const recursive = Task.query()
        .selectRaw("t.id, t.parent_id, t.title, st.depth + 1 AS depth")
        .from("tasks t")
        .join("subtree st", "t.parent_id = st.id");

    const rows = await Task.query()
        .withRecursive("subtree", anchor.unionAll(recursive))
        .from("subtree")
        .selectRaw("id, parent_id, title, depth")
        .withTrashed() // querying the CTE, not the base table — skip soft-delete scope
        .orderBy("depth", "asc")
        .get();

    return ok(c, {
        root: rootId,
        nodes: rows.map((r) => r.toObject()),
    });
});

/**
 * GET /api/analytics/:slug/metrics/meta
 * D1 Sessions + result metadata. Opens a session (first-unconstrained by
 * default, or a bookmark from the `x-bookmark` header), runs the query via
 * getWithMeta(), and surfaces the bookmark + rows_read back to the caller.
 */
analyticsRoutes.get("/:slug/metrics/meta", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const projectIds = Project.query()
        .select(["id"])
        .whereEq("workspace_id", ws.get("id"));

    // Resume a prior session via header bookmark, else start a fresh one.
    const incoming = c.req.header("x-bookmark");

    const q = MetricSnapshot.query()
        .whereIn("project_id", projectIds)
        .scoped("complete")
        .orderBy("captured_on", "desc")
        .limit(20)
        .withSession(incoming ?? "first-unconstrained");

    const { data, meta, bookmark } = await q.getWithMeta();

    if (bookmark) c.header("x-bookmark", bookmark);

    return ok(c, {
        bookmark,
        meta: {
            rows_read: meta.rows_read ?? null,
            rows_written: meta.rows_written ?? null,
            duration_ms: meta.duration ?? null,
            served_by_region: meta.served_by_region ?? null,
        },
        // lastMeta() returns the same metadata as a side-channel accessor.
        last_meta_rows_read: q.lastMeta()?.rows_read ?? null,
        snapshots: data.map((m) => m.toJSON()),
    });
});

/**
 * GET /api/analytics/:slug/busy-days
 * orderByJsonPath is covered in json.ts; here we show `when()` + `scoped()`
 * composing dynamic filters on the metrics aggregate.
 */
analyticsRoutes.get("/:slug/busy-days", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const minVisits = c.req.query("minVisits");
    const onlyComplete = c.req.query("complete") === "1";

    const projectIds = Project.query()
        .select(["id"])
        .whereEq("workspace_id", ws.get("id"));

    const rows = await MetricSnapshot.query()
        .whereIn("project_id", projectIds)
        .when(onlyComplete, (q) => q.scoped("complete"))
        .when(minVisits, (q, value) => q.where("visits", ">=", Number(value)))
        .orderBy("visits", "desc")
        .limit(15)
        .get();

    if (rows.length === 0) return ok(c, { days: [] });

    return ok(c, { days: rows.map((r) => r.toJSON()) });
});

// Defensive guard so an empty workspace slug doesn't 200 with nonsense.
analyticsRoutes.get("/", (c) => fail(c, "validation", "workspace slug required in path", 422));
