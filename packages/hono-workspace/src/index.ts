import { Hono } from "hono";
import { configure } from "@orphnet/d1-eloquent";

import type { AppEnv } from "./lib/env";
import { ok } from "./lib/response";

import { workspaceRoutes } from "./routes/workspaces";
import { projectRoutes } from "./routes/projects";
import { taskRoutes } from "./routes/tasks";
import { postRoutes } from "./routes/posts";
import { commentRoutes } from "./routes/comments";
import { tagRoutes } from "./routes/tags";
import { attachmentRoutes } from "./routes/attachments";
import { searchRoutes } from "./routes/search";
import { feedRoutes } from "./routes/feed";
import { auditRoutes } from "./routes/audit";
import { adminRoutes } from "./routes/admin";
import { jsonRoutes } from "./routes/json";
import { analyticsRoutes } from "./routes/analytics";
import { ledgerRoutes } from "./routes/ledger";
import { releaseRoutes } from "./routes/releases";
import { featureRoutes } from "./routes/features";

const app = new Hono<AppEnv>();

// Wire d1-eloquent's connection registry once per request. `configure(env)`
// is idempotent and cheap - D1 bindings are looked up from `env`.
app.use("*", async (c, next) => {
    configure(c.env as unknown as Record<string, unknown>);
    await next();
});

// Health probe + root manifest
app.get("/", (c) => ok(c, {
    name: c.env.APP_NAME,
    version: "0.1.0",
    docs: "https://github.com/Orphnet/d1-eloquent-examples",
    routes: [
        "GET    /api/workspaces",
        "POST   /api/workspaces",
        "GET    /api/workspaces/:slug",
        "GET    /api/workspaces/:slug/projects",
        "POST   /api/workspaces/:slug/projects",
        "GET    /api/workspaces/:slug/tasks",
        "POST   /api/workspaces/:slug/tasks",
        "PATCH  /api/workspaces/:slug/tasks/:id",
        "DELETE /api/workspaces/:slug/tasks/:id",
        "GET    /api/workspaces/:slug/posts",
        "POST   /api/workspaces/:slug/posts",
        "GET    /api/workspaces/:slug/posts/:slug",
        "POST   /api/workspaces/:slug/posts/:id/comments",
        "GET    /api/tags",
        "POST   /api/tags/:id/attach",
        "POST   /api/tags/:id/sync",
        "POST   /api/attachments",
        "GET    /api/search?q=...",
        "GET    /api/feed?after=<cursor>",
        "GET    /api/audit/:type/:id",
        "GET    /api/json/:slug/settings",
        "GET    /api/json/:slug/settings/search?role=&flag=&minFlags=",
        "PATCH  /api/json/:slug/settings",
        "GET    /api/json/:slug/metrics/aggregate",
        "GET    /api/analytics/:slug/summary",
        "GET    /api/analytics/:slug/top-contributors",
        "GET    /api/analytics/tasks/:id/tree",
        "GET    /api/analytics/:slug/metrics/meta",
        "GET    /api/analytics/:slug/busy-days",
        "POST   /api/ledger/:slug/events",
        "PATCH  /api/ledger/:slug/events/escalate",
        "DELETE /api/ledger/:slug/events/info",
        "POST   /api/ledger/:slug/events/bulk",
        "GET    /api/ledger/:slug/events",
        "POST   /api/releases/:slug/:projectSlug/assets",
        "POST   /api/releases/:slug/:projectSlug/assets/:version/requires",
        "GET    /api/releases/:slug/:projectSlug/assets/:version",
        "GET    /api/releases/_dynamic/channels",
        "GET    /api/features                       # beta.3 feature showcase - index of runnable feature endpoints",
        "GET    /api/features/counters              # 1. increment() / decrement()",
        "GET    /api/features/where-relation        # 2. whereRelation / orWhereRelation / firstWhere",
        "GET    /api/features/replicate             # 3. replicate() + wasRecentlyCreated",
        "GET    /api/features/constrained-eager     # 4. constrained eager loading (.with object-map)",
        "GET    /api/features/enum-cast             # 5. enumCast() (+ onInvalidRead)",
        "GET    /api/features/relation-aggregates   # 6. withMin / withMax / withExists",
        "GET    /api/features/set-operators         # 7. intersect() / except()",
        "GET    /api/features/date-parts            # 8. whereDate / whereTime / whereYear / whereMonth / whereDay",
        "GET    /api/features/global-scopes         # 9. global scopes + withoutGlobalScope(s)",
        "GET    /api/features/through-relations     # 10. hasManyThrough / hasOneThrough",
        "GET    /api/features/prepared-queries      # 11. prepare() + placeholder()",
        "#      (docs) schema-diff generate         # 12. see README §Schema-diff migrations + `bun run db:generate`",
        "GET    /api/features/transactions          # 13. transaction() atomic unit-of-work",
        "GET    /api/features/transaction-counters  # 14. tx.increment() / tx.decrement()",
    ],
}));

app.get("/ready", (c) => ok(c, { ready: true }));

app.route("/api/workspaces", workspaceRoutes);
app.route("/api/workspaces", projectRoutes);
app.route("/api/workspaces", taskRoutes);
app.route("/api/workspaces", postRoutes);
app.route("/api/workspaces", commentRoutes);
app.route("/api/tags", tagRoutes);
app.route("/api/attachments", attachmentRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/feed", feedRoutes);
app.route("/api/audit", auditRoutes);
app.route("/api/json", jsonRoutes);
app.route("/api/analytics", analyticsRoutes);
app.route("/api/ledger", ledgerRoutes);
app.route("/api/releases", releaseRoutes);
app.route("/api/features", featureRoutes);
app.route("/admin", adminRoutes);

app.notFound((c) => c.json({ ok: false, error: { code: "route_not_found", message: "No such route" } }, 404));

app.onError((err, c) => {
    console.error("[unhandled]", err);
    return c.json(
        { ok: false, error: { code: "internal", message: err.message } },
        500,
    );
});

export default app;
