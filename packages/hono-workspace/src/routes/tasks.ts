import { Hono } from "hono";
import { ActivityEvent, Project, Task, Workspace } from "../models";
import { fail, notFound, ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const taskRoutes = new Hono<AppEnv>();

/**
 * List tasks in a workspace with assignee + tags eager-loaded.
 * Supports filtering by status and project_id via query string.
 */
taskRoutes.get("/:slug/tasks", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const status = c.req.query("status");
    const projectId = c.req.query("project_id");

    const q = Task.query()
        .whereIn(
            "project_id",
            Project.query().select(["id"]).whereEq("workspace_id", ws.get("id")),
        )
        .with(["assignee", "tags"])
        .orderBy("priority", "desc")
        .orderBy("created_at", "desc");

    if (status) q.whereEq("status", status);
    else q.scoped("open");
    if (projectId) q.whereEq("project_id", projectId);

    const tasks = await q.get();
    return ok(c, tasks.map((t) => t.toJSON()));
});

/** Create a task. Also records an activity event so the feed picks it up. */
taskRoutes.post("/:slug/tasks", async (c) => {
    const ws = await Workspace.query().whereEq("slug", c.req.param("slug")).first();
    if (!ws) return notFound(c, "workspace");

    const body = await c.req.json<{
        project_id?: string;
        parent_id?: string;
        assignee_id?: string;
        title?: string;
        description?: string;
        priority?: number;
        due_at?: string;
    }>();
    if (!body.project_id || !body.title) {
        return fail(c, "validation", "project_id and title are required", 422);
    }

    const task = await Task.create(
        {
            id: crypto.randomUUID(),
            project_id: body.project_id,
            parent_id: body.parent_id ?? null,
            assignee_id: body.assignee_id ?? null,
            title: body.title,
            description: body.description ?? null,
            status: "open" as const,
            priority: body.priority ?? 0,
            estimated_hours: null,
            due_at: body.due_at ?? null,
            completed_at: null,
        },
        {
            revision: { actorId: body.assignee_id, reason: "task created" },
        },
    );

    await ActivityEvent.create({
        id: crypto.randomUUID(),
        workspace_id: ws.get("id"),
        actor_id: body.assignee_id ?? null,
        verb: "task.created",
        subject_type: "task",
        subject_id: task.get("id"),
        payload: { title: body.title, project_id: body.project_id },
    });

    return ok(c, task.toObject(), 201);
});

/** Update a task — exercises revision tracking and the `updating` hook. */
taskRoutes.patch("/:slug/tasks/:id", async (c) => {
    const id = c.req.param("id");
    const task = await Task.find(id);
    if (!task) return notFound(c, "task");

    const body = await c.req.json<Partial<{ title: string; description: string; status: "open" | "in_progress" | "done" | "cancelled"; priority: number; assignee_id: string | null; due_at: string | null }>>();

    task.fill(body);
    await task.save({
        revision: { reason: "task updated" },
    });

    return ok(c, task.toObject());
});

/** Soft-delete a task. */
taskRoutes.delete("/:slug/tasks/:id", async (c) => {
    const id = c.req.param("id");
    const task = await Task.find(id);
    if (!task) return notFound(c, "task");

    await task.delete({ revision: { reason: "task removed" } });
    return ok(c, { deleted: true, id });
});

/** Time-travel — reconstruct a task as it was at a given ISO timestamp. */
taskRoutes.get("/:slug/tasks/:id/asof/:isoTimestamp", async (c) => {
    const id = c.req.param("id");
    const isoTimestamp = c.req.param("isoTimestamp");
    const past = await Task.asOf(id, isoTimestamp);
    if (!past) return notFound(c, `task at ${isoTimestamp}`);
    return ok(c, past.toObject());
});
