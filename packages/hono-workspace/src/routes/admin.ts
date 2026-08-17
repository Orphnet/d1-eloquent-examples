import { Hono } from "hono";
import { fake } from "@orphnet/d1-eloquent/cli";

import {
    ActivityEvent,
    AssetDependency,
    AuditEvent,
    Comment,
    MetricSnapshot,
    Post,
    Project,
    ReleaseAsset,
    Tag,
    Task,
    User,
    Workspace,
    WorkspaceSetting,
} from "../models";
import type { WorkspaceSettingTheme } from "../models";
import { ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const adminRoutes = new Hono<AppEnv>();

/**
 * POST /admin/seed — populate the database with the canonical demo data.
 *
 * Runs inside a Worker (not the CLI) so the d1-eloquent registry is wired
 * correctly via the top-level `configure(c.env)` middleware. Demonstrates:
 *
 *  - `Model.createMany()` bulk insert with hooks/casts
 *  - `belongsToMany` `attach` for workspace membership
 *  - polymorphic `morphMany` comments on both Task and Post
 *  - polymorphic `morphToMany` tag attachment
 *  - activity events tied to revisions
 *
 * Idempotent: if `?fresh=1` is passed, every row is wiped first.
 */
adminRoutes.post("/seed", async (c) => {
    fake.seed(20260517); // deterministic across runs

    const fresh = c.req.query("fresh") === "1";
    if (fresh) {
        // Order matters — FK respects cascade for most, but be explicit
        const tables = [
            "model_revisions",
            "asset_dependencies",
            "release_assets",
            "audit_events",
            "metric_snapshots",
            "workspace_settings",
            "activity_events",
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
            await c.env.DB.prepare(`DELETE FROM ${t}`).run();
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
    await c.env.DB
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

    // ── Workspace settings (JSON-heavy) ─────────────────────────────────────
    await WorkspaceSetting.create({
        id: crypto.randomUUID(),
        workspace_id: wsId,
        prefs: {
            role: "owner",
            priority: 10,
            density: "comfortable",
            notifications: { email: 1, push: 0 },
            legacy: "remove-me",
        },
        feature_flags: ["beta-search", "json-aggregates", "live-feed"],
        // Deliberately upper-case to demonstrate the `theme` mutator, which
        // lower-cases on write → "dark". Cast narrows to the column's literal type.
        theme: "DARK" as WorkspaceSettingTheme,
        webhook_secret: "whsec_" + fake.hex(16),
    });

    // ── Metric snapshots (full cast matrix) ─────────────────────────────────
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
    let snapCount = 0;
    for (const p of projects) {
        const rows = Array.from({ length: 14 }, (_, day) => {
            const capturedOn = new Date(Date.now() - day * 86400_000).toISOString().slice(0, 10);
            const visits = fake.int(20, 500);
            return {
                id: crypto.randomUUID(),
                project_id: p.get("id"),
                captured_on: capturedOn,
                visits,
                conversion_rate: fake.float(0, 1, 4),
                is_partial: day === 0,
                series: Array.from({ length: 6 }, (_, h) => ({
                    hour: h * 4,
                    visits: fake.int(0, Math.ceil(visits / 4)),
                })),
                breakdown: { direct: fake.int(0, visits), referral: fake.int(0, visits) },
                thumbnail: pngBytes,
                captured_at: new Date(`${capturedOn}T23:59:59.000Z`).toISOString(),
            };
        });
        const created = await MetricSnapshot.createMany(rows);
        snapCount += created.length;
    }

    // ── Audit events (generated columns) ────────────────────────────────────
    const severities: Array<"info" | "warning" | "error" | "critical"> = [
        "info",
        "info",
        "warning",
        "error",
        "critical",
    ];
    await AuditEvent.createMany(
        Array.from({ length: 24 }, () => ({
            id: crypto.randomUUID(),
            workspace_id: wsId,
            actor_id: fake.pick(users.map((u) => u.get("id"))),
            action: fake.pick(["asset.published", "task.deleted", "settings.changed", "member.invited"]),
            resource_type: fake.pick(["task", "post", "release", "user"]),
            resource_id: crypto.randomUUID().slice(0, 8),
            severity: fake.pick(severities),
            amount_cents: fake.int(0, 50000),
            occurred_at: fake.pastDate(30),
        })),
    );

    // ── Release assets (upsert on composite PK) + dependency edges ──────────
    const versions = ["1.0.0", "1.1.0", "2.0.0-beta.1"];
    let assetCount = 0;
    for (const p of projects) {
        const pid = p.get("id");
        for (const version of versions) {
            const now = new Date().toISOString();
            await ReleaseAsset.query().upsert(
                {
                    project_id: pid,
                    version,
                    channel: version.includes("beta") ? "beta" : "stable",
                    artifact_url: `https://cdn.example.com/${pid}/${version}.tar.gz`,
                    size_bytes: fake.int(1_000_000, 80_000_000),
                    published_at: now,
                    created_at: now,
                    updated_at: now,
                },
                ["project_id", "version"],
            );
            assetCount++;
        }
        await AssetDependency.create({
            id: crypto.randomUUID(),
            dependent_project_id: pid,
            dependent_version: "1.1.0",
            requires_project_id: pid,
            requires_version: "1.0.0",
            requested_by: fake.pick(users.map((u) => u.get("id"))),
            constraint_kind: "requires",
        });
    }

    return ok(c, {
        seeded: true,
        workspace: { id: wsId, slug: "acme", name: "Acme HQ" },
        counts: {
            users: users.length,
            tags: tags.length,
            projects: projects.length,
            tasks: totalTasks,
            posts: posts.length,
            comments: 30,
            metric_snapshots: snapCount,
            audit_events: 24,
            release_assets: assetCount,
            workspace_settings: 1,
        },
        try: [
            "GET /api/workspaces/acme",
            "GET /api/workspaces/acme/tasks",
            "GET /api/workspaces/acme/posts",
            "GET /api/feed?workspace=acme",
            "GET /api/search?q=lorem",
            "GET /api/json/acme/settings",
            "GET /api/json/acme/metrics/aggregate",
            "GET /api/analytics/acme/top-contributors",
            "GET /api/ledger/acme/events",
            "GET /api/releases/_dynamic/channels",
        ],
    });
});
