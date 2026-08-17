import { BaseModel } from "@orphnet/d1-eloquent";
import { Project, Workspace } from "../../models";
import { ensureDb } from "../../utils/db";
import { fail, notFound, ok } from "../../utils/response";

/**
 * GET /api/analytics/dynamic-releases?workspace=:slug&channel=stable
 *
 * Builds a model class at runtime with BaseModel.dynamic() — no dedicated model
 * file — over the existing `releases` table, complete with casts and named
 * scopes. Then exercises scoped() + when() for conditional query composition.
 *
 * SECURITY: `dynamic({ table })` emits the table verbatim — only pass trusted,
 * hard-coded table names (as here).
 */
const DynamicRelease = BaseModel.dynamic<{
    id: string;
    project_id: string;
    version: string;
    channel: string;
    downloads: number;
    artifacts: unknown;
    published_at: string | null;
}>({
    table: "releases",
    modelName: "DynamicRelease",
    casts: { downloads: "integer", artifacts: "json" },
    scopes: {
        popular: (q) => q.whereRaw("downloads >= 1000"),
        recent: (q) => q.orderBy("published_at", "desc"),
    },
});

export default defineEventHandler(async (event) => {
    ensureDb(event);
    const q = getQuery(event);
    const slug = q.workspace as string | undefined;
    if (!slug) return fail(event, "validation", "workspace query param required", 422);

    const ws = await Workspace.query().whereEq("slug", slug).first();
    if (!ws) return notFound(event, "workspace");

    const projectIds = await Project.query()
        .whereEq("workspace_id", ws.get("id"))
        .pluck("id");

    const channel = q.channel as string | undefined;

    const rows = await DynamicRelease.query()
        .whereIn("project_id", projectIds)
        .scoped("popular", "recent") // apply two named scopes
        .when(channel, (qb, value) => qb.whereEq("channel", value))
        .limit(20)
        .get();

    return ok(event, {
        model: "BaseModel.dynamic('releases')",
        applied_scopes: ["popular", "recent"],
        channel_filter: channel ?? null,
        releases: rows.map((r) => r.toJSON()),
    });
});
