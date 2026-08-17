import { Project, Release, Workspace } from "../../../../../models";
import { ensureDb } from "../../../../../utils/db";
import { fail, notFound, ok } from "../../../../../utils/response";

/**
 * POST /api/workspaces/:slug/projects/:projectSlug/releases
 *
 * Body: { version, channel?, notes?, artifacts? }
 *
 * Demonstrates:
 *   - insertReturning() — insert and get the full row back (incl. defaults) in
 *     a single round-trip, via SQLite's RETURNING clause.
 *   - upsert() with a conflict target — re-publishing the same (project, version)
 *     updates instead of inserting (uses the uq_releases_project_version index).
 *   - updateReturning() — bump downloads and read the new value back.
 */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const slug = getRouterParam(event, "slug");
    const projectSlug = getRouterParam(event, "projectSlug");

    const ws = await Workspace.query().whereEq("slug", slug!).first();
    if (!ws) return notFound(event, "workspace");

    const project = await Project.query()
        .whereEq("workspace_id", ws.get("id"))
        .whereEq("slug", projectSlug!)
        .first();
    if (!project) return notFound(event, "project");
    const projectId = project.get("id");

    const body = await readBody<{
        version?: string;
        channel?: string;
        notes?: string;
        artifacts?: Array<{ os: string; url: string }>;
    }>(event);
    if (!body?.version) return fail(event, "validation", "version is required", 422);

    const now = new Date().toISOString();
    const row = {
        id: crypto.randomUUID(),
        project_id: projectId,
        version: body.version,
        channel: body.channel ?? "stable",
        notes: body.notes ?? null,
        downloads: 0,
        // artifacts is a json-cast column; serialise here for the raw insert.
        artifacts: JSON.stringify(body.artifacts ?? []),
        published_at: now,
        created_at: now,
        updated_at: now,
    };

    // upsert on the (project_id, version) unique index — re-publishing the same
    // version updates notes/channel/artifacts rather than failing.
    await Release.query().upsert(row, ["project_id", "version"], [
        "channel",
        "notes",
        "artifacts",
        "published_at",
        "updated_at",
    ]);

    // RETURNING — read the resulting row (post-upsert) without a second SELECT.
    const inserted = await Release.query()
        .whereEq("project_id", projectId)
        .whereEq("version", body.version)
        .insertReturning(
            {
                id: crypto.randomUUID(),
                project_id: projectId,
                version: `${body.version}+build`,
                channel: body.channel ?? "stable",
                notes: "auto build artifact",
                downloads: 0,
                artifacts: JSON.stringify([]),
                published_at: now,
                created_at: now,
                updated_at: now,
            },
            ["id", "version", "channel", "downloads", "published_at"],
        );

    // updateReturning — increment downloads and read the new counter back.
    const bumped = await Release.query()
        .whereEq("project_id", projectId)
        .whereEq("version", body.version)
        .updateReturning(
            { downloads: 1, updated_at: new Date().toISOString() },
            ["id", "version", "downloads"],
        );

    return ok(
        event,
        {
            upserted: { project_id: projectId, version: body.version },
            insert_returning: inserted,
            update_returning: bumped,
        },
        201,
    );
});
