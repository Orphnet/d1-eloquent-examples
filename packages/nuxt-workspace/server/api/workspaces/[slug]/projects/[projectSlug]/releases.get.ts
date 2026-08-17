import { Project, Release, Workspace } from "../../../../../models";
import { ensureDb } from "../../../../../utils/db";
import { notFound, ok } from "../../../../../utils/response";

/**
 * GET /api/workspaces/:slug/projects/:projectSlug/releases
 *   ?bookmark=<d1-session-bookmark>
 *
 * Demonstrates D1 read sessions + result metadata:
 *   - withSession(constraint | bookmark) opens/continues a read session
 *   - getWithMeta() returns { data, meta, bookmark }
 *   - getBookmark() / lastMeta() expose the session position + row counts
 *
 * The response echoes the bookmark in `x-d1-bookmark` so a follow-up request
 * can pass it back via ?bookmark= to read-your-writes against the same replica.
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

    // Use a prior bookmark if supplied, else start a fresh primary-constrained
    // session (so we observe our own recent writes).
    const incoming = (getQuery(event).bookmark as string) || "first-primary";

    const qb = Release.query()
        .withSession(incoming)
        .whereEq("project_id", projectId)
        .scoped("published")
        .orderBy("published_at", "desc");

    const { data, meta, bookmark } = await qb.getWithMeta();

    // lastMeta() returns the same metadata captured on the builder.
    const lastMeta = qb.lastMeta();
    if (bookmark) setResponseHeader(event, "x-d1-bookmark", bookmark);

    return ok(event, {
        releases: data.map((r) => r.toJSON()),
        session: {
            bookmark: bookmark ?? qb.getBookmark(),
            rows_read: meta?.rows_read ?? lastMeta?.rows_read ?? null,
            served_by_region: meta?.served_by_region ?? null,
        },
    });
});
