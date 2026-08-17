import { Hono } from "hono";
import { Workspace, User } from "../models";
import { buildCache } from "../lib/cache";
import { fail, notFound, ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const workspaceRoutes = new Hono<AppEnv>();

/** List all workspaces (KV-cached for 60s). */
workspaceRoutes.get("/", async (c) => {
    const cache = buildCache(c.env);
    const list = await cache.remember(
        "workspaces:list",
        60,
        async () => {
            const rows = await Workspace.query().orderBy("name").get();
            return rows.map((w) => w.toObject());
        },
    );
    return ok(c, list);
});

/** Create a workspace + optionally seed an owner membership. */
workspaceRoutes.post("/", async (c) => {
    const cache = buildCache(c.env);
    const body = await c.req.json<{ slug?: string; name?: string; owner_id?: string }>();
    if (!body.slug || !body.name) {
        return fail(c, "validation", "slug and name are required", 422);
    }

    const ws = await Workspace.create(
        {
            id: crypto.randomUUID(),
            slug: body.slug,
            name: body.name,
            settings: {},
        },
        { cache },
    );

    if (body.owner_id) {
        await ws.related("members").attach!(body.owner_id, {
            extras: { role: "owner" },
            db: c.env.DB,
        });
    }

    return ok(c, ws.toObject(), 201);
});

/** Fetch a workspace by slug, with member + counts eager-loaded. */
workspaceRoutes.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const ws = await Workspace.query()
        
        .whereEq("slug", slug)
        .withCount("projects")
        .withCount("posts")
        .withCount("members")
        .with(["members"])
        .first();
    if (!ws) return notFound(c, `workspace "${slug}"`);

    // withCount() adds aggregate columns (`*_count`) that aren't part of the
    // model's attribute interface — read them off the serialized row.
    const json = ws.toJSON();
    return ok(c, {
        ...json,
        members_count: json.members_count,
        projects_count: json.projects_count,
        posts_count: json.posts_count,
    });
});
