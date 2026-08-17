import { Workspace } from "../../models";
import { ensureDb } from "../../utils/db";
import { notFound, ok } from "../../utils/response";

/** GET /api/workspaces/:slug — workspace + counts + members eager-loaded. */
export default defineEventHandler(async (event) => {
    ensureDb(event);
    const slug = getRouterParam(event, "slug");
    if (!slug) return notFound(event, "workspace");

    const ws = await Workspace.query()
        .whereEq("slug", slug)
        .withCount("projects")
        .withCount("posts")
        .withCount("members")
        .with(["members"])
        .first();
    if (!ws) return notFound(event, `workspace "${slug}"`);

    // withCount() adds `*_count` aggregate columns that aren't on the model's
    // attribute interface — read them off the serialized row.
    const json = ws.toJSON();
    return ok(event, {
        ...json,
        members_count: json.members_count,
        projects_count: json.projects_count,
        posts_count: json.posts_count,
    });
});
