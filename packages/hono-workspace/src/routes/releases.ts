import { Hono } from "hono";
import { BaseModel } from "@orphnet/d1-eloquent";
import {
    AssetDependency,
    Project,
    ReleaseAsset,
    Workspace,
} from "../models";
import { fail, notFound, ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const releaseRoutes = new Hono<AppEnv>();

/**
 * POST /api/releases/:slug/:projectSlug/assets
 * Upsert a release asset on the composite (project_id, version) primary key.
 * Demonstrates the query builder's `upsert(values, conflictCols)` — re-running
 * the same version updates the existing row instead of erroring.
 */
releaseRoutes.post("/:slug/:projectSlug/assets", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const project = await Project.query()
        .whereEq("workspace_id", ws.get("id"))
        .whereEq("slug", c.req.param("projectSlug"))
        .first();
    if (!project) return notFound(c, "project");

    const body = await c.req.json<{
        version?: string;
        channel?: string;
        artifact_url?: string;
        size_bytes?: number;
    }>();
    if (!body.version || !body.artifact_url) {
        return fail(c, "validation", "version and artifact_url are required", 422);
    }

    const now = new Date().toISOString();
    // ON CONFLICT(project_id, version) DO UPDATE — idempotent publish.
    await ReleaseAsset.query().upsert(
        {
            project_id: project.get("id"),
            version: body.version,
            channel: body.channel ?? "stable",
            artifact_url: body.artifact_url,
            size_bytes: body.size_bytes ?? 0,
            published_at: now,
            created_at: now,
            updated_at: now,
        },
        ["project_id", "version"], // conflict target = composite PK
    );

    const asset = await ReleaseAsset.query()
        .whereEq("project_id", project.get("id"))
        .whereEq("version", body.version)
        .first();

    return ok(c, asset?.toObject() ?? null, 201);
});

/**
 * POST /api/releases/:slug/:projectSlug/assets/:version/requires
 * Create a composite-FK dependency edge: this asset requires another asset.
 * Persists two (project_id, version) composite foreign keys into
 * `asset_dependencies` (see migration for the three FK declaration forms).
 */
releaseRoutes.post("/:slug/:projectSlug/assets/:version/requires", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const project = await Project.query()
        .whereEq("workspace_id", ws.get("id"))
        .whereEq("slug", c.req.param("projectSlug"))
        .first();
    if (!project) return notFound(c, "project");
    const projectId = project.get("id");
    const dependentVersion = c.req.param("version");

    const body = await c.req.json<{
        requires_project_id?: string;
        requires_version?: string;
        requested_by?: string;
        constraint_kind?: "requires" | "optional" | "conflicts";
    }>();
    if (!body.requires_project_id || !body.requires_version) {
        return fail(c, "validation", "requires_project_id and requires_version are required", 422);
    }

    const edge = await AssetDependency.create({
        id: crypto.randomUUID(),
        dependent_project_id: projectId,
        dependent_version: dependentVersion,
        requires_project_id: body.requires_project_id,
        requires_version: body.requires_version,
        requested_by: body.requested_by ?? null,
        constraint_kind: body.constraint_kind ?? "requires",
    });

    return ok(c, edge.toObject(), 201);
});

/**
 * GET /api/releases/:slug/:projectSlug/assets/:version
 * Fetch an asset + its dependency edges via the composite-key hasMany relation.
 */
releaseRoutes.get("/:slug/:projectSlug/assets/:version", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const project = await Project.query()
        .whereEq("workspace_id", ws.get("id"))
        .whereEq("slug", c.req.param("projectSlug"))
        .first();
    if (!project) return notFound(c, "project");

    const asset = await ReleaseAsset.query()
        .whereEq("project_id", project.get("id"))
        .whereEq("version", c.req.param("version"))
        .with(["dependencies"])
        .first();
    if (!asset) return notFound(c, "release asset");

    return ok(c, asset.toJSON());
});

/**
 * GET /api/releases/_dynamic/channels
 * BaseModel.dynamic — build a model class at runtime (no model file) and query
 * with it. Here we count assets per channel without defining a dedicated model.
 */
releaseRoutes.get("/_dynamic/channels", async (c) => {
    // Dynamic model over the same table, configured inline.
    const DynamicAsset = BaseModel.dynamic({
        table: "release_assets",
        primaryKey: "project_id",
        timestamps: true,
        casts: { size_bytes: "integer" },
    });

    const rows = await DynamicAsset.query()
        .select(["channel"])
        .selectRaw("COUNT(*) AS asset_count, SUM(size_bytes) AS total_bytes")
        .groupBy("channel")
        .orderBy("asset_count", "desc")
        .get();

    return ok(c, {
        via: "BaseModel.dynamic",
        channels: rows.map((r) => r.toObject()),
    });
});
