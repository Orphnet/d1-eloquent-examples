import { ok } from "../utils/response";

/** GET /api - manifest of available endpoints, mirrors the Hono example. */
export default defineEventHandler((event) => {
    return ok(event, {
        name: "Workspace (Nuxt)",
        version: "0.1.0",
        docs: "https://github.com/Orphnet/d1-eloquent-examples",
        endpoints: [
            "POST /api/admin/seed?fresh=1",
            "GET  /api/workspaces",
            "GET  /api/workspaces/:slug",
            "GET  /api/workspaces/:slug/projects",
            "GET  /api/workspaces/:slug/tasks",
            "POST /api/workspaces/:slug/tasks",
            "PATCH /api/workspaces/:slug/tasks/:id",
            "DELETE /api/workspaces/:slug/tasks/:id",
            "POST /api/workspaces/:slug/tasks/:id/comments",
            "GET  /api/workspaces/:slug/posts",
            "GET  /api/workspaces/:slug/posts/:postSlug",
            "GET  /api/feed?workspace=:slug",
            "GET  /api/search?q=...",
            "GET  /api/tags",
            "POST /api/tags/:id/attach",
            "POST /api/tags/:id/detach",
            "POST /api/tags/sync",
            "GET  /api/audit/:type/:id",
            "GET  /api/audit/tasks/:id/asof/:ts",
            // ── Beta.3 feature showcase (see /features page) ────────────────
            "GET  /api/features                          (all 14 beta.3 features, live results)",
            "GET  /api/features/:key                     (one feature in isolation, e.g. increment-decrement)",
            // ── New feature demos ──────────────────────────────────────────
            "GET  /api/workspaces/:slug/settings        (JSON query helpers, casts, accessors/appends/hidden)",
            "PATCH /api/workspaces/:slug/settings        (updateJsonSet / updateJsonPatch / updateJsonRemove)",
            "GET  /api/analytics/usage?workspace=:slug   (scalar + JSON aggregates, CTE, generated columns)",
            "GET  /api/analytics/overview?workspace=:slug (withCount / withSum / withAvg, nested eager load)",
            "GET  /api/analytics/critical-path?workspace=:slug (recursive CTE over task_dependencies)",
            "GET  /api/analytics/dynamic-releases?workspace=:slug (BaseModel.dynamic + scoped/when)",
            "GET  /api/workspaces/:slug/projects/:projectSlug/releases       (D1 session + result meta)",
            "POST /api/workspaces/:slug/projects/:projectSlug/releases       (insertReturning / upsert)",
            "DELETE /api/workspaces/:slug/projects/:projectSlug/releases/:version (deleteReturning)",
        ],
    });
});
