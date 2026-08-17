import { fake } from "@orphnet/d1-eloquent/cli";
import {
    ActivityEvent,
    Comment,
    MetricEvent,
    Post,
    Project,
    Release,
    Tag,
    Task,
    User,
    Workspace,
    WorkspaceSetting,
} from "../../models";
import { ensureDb } from "../../utils/db";
import { ok } from "../../utils/response";

/**
 * POST /api/admin/seed?fresh=1
 *
 * Populate the database with the canonical demo data. Mirrors the Hono
 * example one-for-one so the same curl recipes work against either
 * deployment. Runs inside Nitro so `configure(env)` wires the runtime
 * D1 binding into d1-eloquent's connection registry.
 */
export default defineEventHandler(async (event) => {
    const env = ensureDb(event);
    fake.seed(20260517);

    const fresh = getQuery(event).fresh === "1";
    if (fresh) {
        const tables = [
            "model_revisions",
            "activity_events",
            "metric_events",
            "releases",
            "task_dependencies",
            "workspace_settings",
            "attachments",
            "taggables",
            "tags",
            "comments",
            "tasks",
            "projects",
            "posts",
            "workspace_members",
            "users",
            "workspaces",
        ];
        for (const t of tables) {
            await env.DB.prepare(`DELETE FROM ${t}`).run();
        }
    }

    // ── Workspace ──────────────────────────────────────────────────────────
    const workspace = await Workspace.create({
        id: crypto.randomUUID(),
        slug: "acme",
        name: "Acme HQ",
        settings: { theme: "default", invite_only: false },
    });
    const wsId = workspace.get("id");

    // ── Users ──────────────────────────────────────────────────────────────
    const users = await User.createMany(
        Array.from({ length: 8 }, (_, i) => ({
            id: crypto.randomUUID(),
            email: fake.email().toLowerCase(),
            name: fake.name(),
            avatar_url: `https://i.pravatar.cc/100?img=${i + 1}`,
            is_admin: i === 0,
        })),
    );

    await workspace.related("members").attach!(users.map((u) => u.get("id")));
    await env.DB
        .prepare("UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?")
        .bind("owner", wsId, users[0]!.get("id"))
        .run();

    // ── Tags ───────────────────────────────────────────────────────────────
    const tagLabels = ["urgent", "bug", "feature", "docs", "design", "ops", "research", "announcement"];
    const tags = await Tag.createMany(
        tagLabels.map((label) => ({
            id: crypto.randomUUID(),
            workspace_id: wsId,
            label,
            color: "#" + fake.hex(3),
        })),
    );

    // ── Projects + Tasks ───────────────────────────────────────────────────
    const projectNames = ["Platform", "Mobile App", "Marketing Site"];
    const projectSlugs = ["platform", "mobile", "marketing"];
    const projects = await Project.createMany(
        projectNames.map((name, i) => ({
            id: crypto.randomUUID(),
            workspace_id: wsId,
            name,
            slug: projectSlugs[i],
            description: fake.sentence(),
            color: "#" + fake.hex(3),
        })),
    );

    let totalTasks = 0;
    for (const p of projects) {
        const tasksForProject = Array.from({ length: 12 }, () => {
            const status = fake.pick<"open" | "in_progress" | "done">([
                "open",
                "open",
                "open",
                "in_progress",
                "done",
            ]);
            return {
                id: crypto.randomUUID(),
                project_id: p.get("id"),
                parent_id: null,
                assignee_id: fake.pick(users.map((u) => u.get("id"))),
                title: fake.sentence(8).replace(".", ""),
                description: fake.paragraph(),
                status,
                priority: fake.int(0, 3),
                estimated_hours: fake.float(0.5, 16),
                due_at: fake.boolean()
                    ? new Date(Date.now() + fake.int(1, 30) * 86400_000).toISOString()
                    : null,
                completed_at: status === "done" ? new Date().toISOString() : null,
            };
        });
        const created = await Task.createMany(tasksForProject, { skipRevisions: true });
        totalTasks += created.length;

        for (const t of created) {
            if (fake.boolean(0.3)) {
                const picked = fake.pickMany(
                    tags.map((tg) => tg.get("id")),
                    fake.int(1, 2),
                );
                await t.related("tags").attach!(picked);
            }
        }
    }

    // ── Posts ──────────────────────────────────────────────────────────────
    const postCount = 10;
    const posts = await Post.createMany(
        Array.from({ length: postCount }, (_, i) => {
            const author = fake.pick(users);
            const published = i < postCount - 2;
            return {
                id: crypto.randomUUID(),
                workspace_id: wsId,
                author_id: author.get("id"),
                slug: `post-${i + 1}-${fake.slug(2)}`,
                title: fake.sentence(8).replace(".", ""),
                body: fake.paragraph(4) + "\n\n" + fake.paragraph(5),
                status: published ? ("published" as const) : ("draft" as const),
                metadata: {
                    reading_time_minutes: fake.int(2, 12),
                    excerpt: fake.sentence(),
                },
                published_at: published ? new Date(Date.now() - i * 86400_000).toISOString() : null,
                view_count: published ? fake.int(10, 2000) : 0,
            };
        }),
        { skipRevisions: true },
    );

    for (const p of posts) {
        if (p.get("status") === "published" && fake.boolean(0.5)) {
            const picked = fake.pickMany(
                tags.map((tg) => tg.get("id")),
                fake.int(1, 3),
            );
            await p.related("tags").attach!(picked);
        }
    }

    // ── Comments ───────────────────────────────────────────────────────────
    const allTaskIds = await Task.query().select(["id"]).pluck("id");
    const publishedPostIds = posts
        .filter((p) => p.get("status") === "published")
        .map((p) => p.get("id"));
    const subjects: { type: "task" | "post"; id: string }[] = [
        ...allTaskIds.map((id) => ({ type: "task" as const, id: id as string })),
        ...publishedPostIds.map((id) => ({ type: "post" as const, id })),
    ];

    for (let i = 0; i < 30; i++) {
        const target = fake.pick(subjects);
        const author = fake.pick(users);
        await Comment.create({
            id: crypto.randomUUID(),
            author_id: author.get("id"),
            body: fake.paragraph(2),
            commentable_type: target.type,
            commentable_id: target.id,
            approved: fake.boolean(0.95),
        });
    }

    // ── Activity events ────────────────────────────────────────────────────
    await ActivityEvent.createMany(
        posts
            .filter((p) => p.get("status") === "published")
            .map((p) => ({
                id: crypto.randomUUID(),
                workspace_id: wsId,
                actor_id: p.get("author_id"),
                verb: "post.published",
                subject_type: "post",
                subject_id: p.get("id"),
                payload: { title: p.get("title") },
            })),
    );

    // ── Workspace settings (JSON-heavy, full cast matrix) ──────────────────
    // Demonstrates json/array/boolean/integer/real/date/datetime casts. The
    // accessor-driven `feature_flags` mutator lower-cases on write.
    await WorkspaceSetting.create({
        id: crypto.randomUUID(),
        workspace_id: wsId,
        preferences: {
            theme: "dark",
            locale: "en-GB",
            density: "comfortable",
            integrations: { slack: true, github: true, jira: false },
            sidebar_order: ["projects", "tasks", "posts"],
        },
        feature_flags: ["Beta-Search", "AI-Summaries", "Metrics-V2"],
        notifications_enabled: true,
        seat_limit: 25,
        storage_quota_gb: 50.5,
        trial_ends_on: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10),
        activated_at: new Date().toISOString(),
        brand_logo: null,
    });

    // ── Metric events (generated columns: total_cost STORED, day_bucket VIRTUAL)
    const metrics = ["api_calls", "storage", "seats", "bandwidth"] as const;
    const metricRows = Array.from({ length: 14 }, (_, d) => {
        const occurred = new Date(Date.now() - d * 86400_000).toISOString();
        return metrics.map((metric) => ({
            id: crypto.randomUUID(),
            workspace_id: wsId,
            project_id: fake.boolean(0.6) ? fake.pick(projects).get("id") : null,
            metric,
            quantity: fake.int(0, 500),
            unit_cost: fake.float(0.001, 0.05, 4),
            dimensions: { region: fake.pick(["eu", "us", "apac"]), tier: fake.pick(["free", "pro"]) },
            // total_cost + day_bucket are generated — never written here.
            occurred_at: occurred,
        }));
    }).flat();
    await MetricEvent.createMany(metricRows);

    // ── Releases (RETURNING / upsert / batch surface) ──────────────────────
    const channels = ["stable", "beta", "canary"] as const;
    const releaseRows = projects.flatMap((p) => {
        const pid = p.get("id");
        return Array.from({ length: 3 }, (_, v) => ({
            id: crypto.randomUUID(),
            project_id: pid,
            version: `1.${v}.0`,
            channel: channels[v] ?? "stable",
            notes: fake.sentence(),
            downloads: fake.int(0, 5000),
            artifacts: [
                { os: "linux", url: fake.url("dl/linux") },
                { os: "macos", url: fake.url("dl/macos") },
            ],
            published_at: new Date(Date.now() - v * 7 * 86400_000).toISOString(),
        }));
    });
    await Release.createMany(releaseRows);

    // ── Task dependencies (composite-FK pivot + recursive-CTE graph) ───────
    // Build a small chain per project so the recursive CTE has depth.
    const ownerId = users[0]!.get("id");
    let depCount = 0;
    for (const p of projects) {
        const pid = p.get("id");
        const projTaskIds = await Task.query()
            .whereEq("project_id", pid)
            .orderBy("created_at", "asc")
            .limit(5)
            .pluck("id");
        for (let i = 0; i + 1 < projTaskIds.length; i++) {
            // task[i+1] depends_on task[i] — a linear blocking chain.
            await env.DB.prepare(
                `INSERT OR IGNORE INTO task_dependencies
                    (task_id, depends_on_id, workspace_id, requested_by, created_via, kind)
                 VALUES (?, ?, ?, ?, ?, ?)`,
            )
                .bind(
                    projTaskIds[i + 1] as string,
                    projTaskIds[i] as string,
                    wsId,
                    ownerId,
                    ownerId,
                    "blocks",
                )
                .run();
            depCount++;
        }
    }

    return ok(event, {
        seeded: true,
        workspace: { id: wsId, slug: "acme", name: "Acme HQ" },
        counts: {
            users: users.length,
            tags: tags.length,
            projects: projects.length,
            tasks: totalTasks,
            posts: posts.length,
            comments: 30,
            settings: 1,
            metric_events: metricRows.length,
            releases: releaseRows.length,
            task_dependencies: depCount,
        },
        try: [
            "GET /api/workspaces/acme",
            "GET /api/workspaces/acme/tasks",
            "GET /api/workspaces/acme/posts",
            "GET /api/feed?workspace=acme",
            "GET /api/search?q=lorem",
            "GET /api/workspaces/acme/settings",
            "PATCH /api/workspaces/acme/settings",
            "GET /api/analytics/usage?workspace=acme",
            "GET /api/analytics/critical-path?workspace=acme",
            "GET /api/workspaces/acme/projects/platform/releases",
            "POST /api/workspaces/acme/projects/platform/releases",
        ],
    });
});
