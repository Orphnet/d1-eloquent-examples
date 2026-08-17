import { Project, Workspace } from "../../models";
import { ensureDb } from "../../utils/db";
import { fail, notFound, ok } from "../../utils/response";

/**
 * GET /api/analytics/overview?workspace=:slug
 *
 * Demonstrates:
 *   - relation aggregates  — withCount / withSum / withAvg compiled as
 *     correlated subqueries (no N+1).
 *   - nested eager loading — .with(['projects', 'projects.releases']) loads the
 *     workspace's projects and each project's releases in batched queries.
 *   - when() conditional clauses — only filter `published` releases when asked.
 */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const q = getQuery(event);
    const slug = q.workspace as string | undefined;
    if (!slug) return fail(event, "validation", "workspace query param required", 422);

    const ws = await Workspace.query().whereEq("slug", slug).first();
    if (!ws) return notFound(event, "workspace");
    const wsId = ws.get("id");

    // Relation aggregates on Workspace: count projects/posts, sum/avg metric cost.
    const enriched = await Workspace.query()
        .whereEq("id", wsId)
        .withCount("projects")
        .withCount("posts")
        .withSum("metrics", "total_cost")
        .withAvg("metrics", "quantity")
        .first();

    // Per-project release aggregates + nested eager load of the releases.
    const onlyPublished = q.published === "1";
    const projects = await Project.query()
        .whereEq("workspace_id", wsId)
        .withCount("releases")
        .withSum("releases", "downloads")
        .when(onlyPublished, (qb) => qb.whereHas("releases", (r) => r.whereNotNull("published_at")))
        .with(["releases"]) // nested: project → releases
        .orderBy("name", "asc")
        .get();

    // withCount/withSum/withAvg add aggregate columns that aren't on the model's
    // attribute interface — read them off the serialized row.
    const enrichedJson = enriched?.toJSON();
    return ok(event, {
        workspace: {
            slug,
            projects_count: enrichedJson?.projects_count ?? 0,
            posts_count: enrichedJson?.posts_count ?? 0,
            metrics_total_cost_sum: enrichedJson?.metrics_total_cost_sum ?? 0,
            metrics_quantity_avg: enrichedJson?.metrics_quantity_avg ?? null,
        },
        projects: projects.map((p) => {
            const json = p.toJSON();
            return {
                name: p.get("name"),
                slug: p.get("slug"),
                releases_count: json.releases_count,
                releases_downloads_sum: json.releases_downloads_sum,
                releases: (p.relations.releases ?? []).map((r) => ({
                    version: r.get("version"),
                    channel: r.get("channel"),
                    downloads: r.get("downloads"),
                })),
            };
        }),
    });
});
