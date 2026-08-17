import { Task, Workspace } from "../../models";
import { ensureDb } from "../../utils/db";
import { fail, notFound, ok } from "../../utils/response";

/**
 * GET /api/analytics/critical-path?workspace=:slug&from=:taskId
 *
 * Walks the `task_dependencies` graph with a RECURSIVE CTE (`withRecursive`)
 * to find the full blocking chain reachable from a starting task. If `from`
 * is omitted, picks a task that nothing depends on (a chain head).
 *
 * The recursion seeds with the start task, then repeatedly joins
 * `task_dependencies` to follow `depends_on_id` edges, tracking depth.
 */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const q = getQuery(event);
    const slug = q.workspace as string | undefined;
    if (!slug) return fail(event, "validation", "workspace query param required", 422);

    const ws = await Workspace.query().whereEq("slug", slug).first();
    if (!ws) return notFound(event, "workspace");
    const wsId = ws.get("id");

    // Choose a starting task: explicit, or a "head" (depended on by nobody).
    let start = q.from as string | undefined;
    if (!start) {
        const head = await Task.query()
            .from("task_dependencies")
            .withTrashed()
            .whereEq("workspace_id", wsId)
            .selectRaw("task_id")
            .whereRaw(
                "task_id NOT IN (SELECT depends_on_id FROM task_dependencies WHERE workspace_id = ?)",
                [wsId],
            )
            .first();
        start = head ? (head.toRaw().task_id as string) : undefined;
    }
    if (!start) return ok(event, { workspace: slug, start: null, chain: [] });

    // Recursive seed: the start node at depth 0. Recursive step: follow
    // depends_on edges. The anchor query selects the literal start id.
    const seed = Task.query()
        .selectRaw("id AS task_id, 0 AS depth")
        .whereEq("id", start);

    const recursion = Task.query()
        .from("chain c")
        .withTrashed()
        .selectRaw("td.depends_on_id AS task_id, c.depth + 1 AS depth")
        .join("task_dependencies td", "td.task_id = c.task_id");

    const chain = await Task.query()
        .from("chain")
        .withTrashed()
        .withRecursive("chain", seed.unionAll(recursion), ["task_id", "depth"])
        .selectRaw("task_id, depth")
        .orderBy("depth", "asc")
        .get();

    // The CTE projects `task_id` / `depth` aliases that aren't on TaskAttrs —
    // read them off the raw attribute bag.
    const ids = chain.map((r) => r.toRaw().task_id as string);
    const titles =
        ids.length > 0
            ? await Task.query().whereIn("id", ids).withTrashed().get()
            : [];
    const titleById = new Map<string, string>(
        titles.map((t) => [t.get("id"), t.get("title")]),
    );

    return ok(event, {
        workspace: slug,
        start,
        chain: chain.map((r) => {
            const raw = r.toRaw();
            return {
                depth: raw.depth,
                task_id: raw.task_id,
                title: titleById.get(raw.task_id as string) ?? null,
            };
        }),
    });
});
