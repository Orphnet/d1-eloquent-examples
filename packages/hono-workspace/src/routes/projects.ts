import { Hono } from "hono";
import { Project, Workspace } from "../models";
import { fail, notFound, ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const projectRoutes = new Hono<AppEnv>();

/** List projects in a workspace, with task counts. */
projectRoutes.get("/:slug/projects", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const projects = await Project.query()

        .whereEq("workspace_id", ws.get("id"))
        .withCount("tasks")
        .orderBy("name")
        .get();

    return ok(c, projects.map((p) => {
        const json = p.toJSON();
        return { ...json, tasks_count: json.tasks_count };
    }));
});

/** Create a project in a workspace. */
projectRoutes.post("/:slug/projects", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const body = await c.req.json<{ name?: string; slug?: string; description?: string; color?: string }>();
    if (!body.name || !body.slug) {
        return fail(c, "validation", "name and slug are required", 422);
    }

    const project = await Project.create({
        id: crypto.randomUUID(),
        workspace_id: ws.get("id"),
        name: body.name,
        slug: body.slug,
        description: body.description ?? null,
        color: body.color ?? "#3b82f6",
    });

    return ok(c, project.toObject(), 201);
});
