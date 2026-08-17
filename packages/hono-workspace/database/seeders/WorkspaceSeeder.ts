import { getPlatformProxy } from "wrangler";
import { fake, output } from "@orphnet/d1-eloquent/cli";
import type { TSeeder, TSeederOpts } from "@orphnet/d1-eloquent/cli";
import { configure } from "@orphnet/d1-eloquent";

import { Workspace } from "../../src/models/Workspace";
import { User } from "../../src/models/User";
import { Project } from "../../src/models/Project";
import { Task } from "../../src/models/Task";
import { Post } from "../../src/models/Post";
import { Comment } from "../../src/models/Comment";
import { Tag } from "../../src/models/Tag";
import { ActivityEvent } from "../../src/models/ActivityEvent";

/**
 * One-shot seeder that creates the canonical demo workspace with realistic
 * fake data. Demonstrates:
 *
 *   - Model.createMany() for batch user inserts
 *   - belongsToMany attach for workspace membership
 *   - polymorphic morphMany comments (on both Task and Post)
 *   - polymorphic morphToMany tag attachment (on Task and Post)
 *   - activity events tied to revisions
 *   - the seeder output helpers (progressBar, step, success)
 */
const seeder: TSeeder = {
    name: "WorkspaceSeeder",
    description: "Demo data — workspaces, users, projects, tasks, posts, comments, tags, activity.",

    async run(_opts: TSeederOpts) {
        // The CLI runs in Node (not a Worker), so obtain a real *local* D1 binding
        // via wrangler's platform proxy, then register it in the d1-eloquent
        // connection registry so model methods work without an explicit `db`
        // argument throughout the seeder.
        const proxy = await getPlatformProxy<{ DB: D1Database }>();
        const db = proxy.env.DB as unknown as D1Database;
        configure({ DB: db });

        fake.seed(20260517); // deterministic across runs

        const userCount = 8;
        const projectCount = 3;
        const tasksPerProject = 12;
        const postCount = 10;
        const tagCount = 8;
        const commentCount = 30;

        output.info("Seeding the demo workspace");

        // ── Workspace ──────────────────────────────────────────────────────
        const workspace = await Workspace.create({
            id: crypto.randomUUID(),
            slug: "acme",
            name: "Acme HQ",
            settings: { theme: "default", invite_only: false },
        });
        const wsId = workspace.get("id");
        output.success(`Workspace: ${workspace.get("name")} (slug=acme)`);

        // ── Users ──────────────────────────────────────────────────────────
        const bar = output.progressBar("users", userCount, { tag: "users" });
        const userRows = Array.from({ length: userCount }, (_, i) => ({
            id: crypto.randomUUID(),
            email: fake.email().toLowerCase(),
            name: fake.name(),
            avatar_url: `https://i.pravatar.cc/100?img=${i + 1}`,
            is_admin: i === 0,
        }));
        // Bulk insert with hooks + casts — much faster than a Promise.all loop
        const users = await User.createMany(userRows);
        users.forEach(() => bar.tick());
        bar.complete();

        // Attach all users to the workspace (owner = first user)
        await workspace.related("members").attach!(
            users.map((u) => u.get("id")),
            { db },
        );
        // Promote the owner
        await db
            .prepare("UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?")
            .bind("owner", wsId, users[0]!.get("id"))
            .run();
        output.success(`${users.length} users — first is the workspace owner`);

        // ── Tags ───────────────────────────────────────────────────────────
        const tagLabels = ["urgent", "bug", "feature", "docs", "design", "ops", "research", "announcement"];
        const tags = await Tag.createMany(
            tagLabels.slice(0, tagCount).map((label) => ({
                id: crypto.randomUUID(),
                workspace_id: wsId,
                label,
                color: '#' + fake.hex(3),
            })),
        );
        output.success(`${tags.length} tags`);

        // ── Projects + Tasks ───────────────────────────────────────────────
        const projects = await Project.createMany(
            Array.from({ length: projectCount }, (_, i) => ({
                id: crypto.randomUUID(),
                workspace_id: wsId,
                name: ["Platform", "Mobile App", "Marketing Site"][i],
                slug: ["platform", "mobile", "marketing"][i],
                description: fake.sentence(),
                color: '#' + fake.hex(3),
            })),
        );

        const taskBar = output.progressBar("tasks", projectCount * tasksPerProject, { tag: "tasks" });
        let totalTasks = 0;
        for (const p of projects) {
            const taskRows = Array.from({ length: tasksPerProject }, () => {
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
                    due_at: fake.boolean() ? new Date(Date.now() + fake.int(1, 30) * 86400_000).toISOString() : null,
                    completed_at: status === "done" ? new Date().toISOString() : null,
                };
            });
            const created = await Task.createMany(taskRows, { skipRevisions: true });
            created.forEach(() => taskBar.tick());
            totalTasks += created.length;

            // Tag 30% of tasks with 1-2 random tags
            for (const t of created) {
                if (fake.boolean(0.3)) {
                    const picked = fake.pickMany(
                        tags.map((tg) => tg.get("id")),
                        fake.int(1, 2),
                    );
                    await t.related("tags").attach!(picked, { db });
                }
            }
        }
        taskBar.complete();
        output.success(`${totalTasks} tasks across ${projects.length} projects`);

        // ── Posts ──────────────────────────────────────────────────────────
        const posts = await Post.createMany(
            Array.from({ length: postCount }, (_, i) => {
                const author = fake.pick(users);
                const published = i < postCount - 2; // last 2 are drafts
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
        output.success(`${posts.length} posts (${posts.filter((p) => p.get("status") === "published").length} published)`);

        // Tag 50% of published posts
        for (const p of posts) {
            if (p.get("status") === "published" && fake.boolean(0.5)) {
                const picked = fake.pickMany(
                    tags.map((tg) => tg.get("id")),
                    fake.int(1, 3),
                );
                await p.related("tags").attach!(picked, { db });
            }
        }

        // ── Comments ───────────────────────────────────────────────────────
        const commentBar = output.progressBar("comments", commentCount, { tag: "comments" });
        const allTaskIds = (await Task.query().select(["id"]).pluck("id")) as string[];
        const publishedPostIds = posts
            .filter((p) => p.get("status") === "published")
            .map((p) => p.get("id"));
        const allCommentables: { type: "task" | "post"; id: string }[] = [
            ...allTaskIds.map((id) => ({ type: "task" as const, id })),
            ...publishedPostIds.map((id) => ({ type: "post" as const, id })),
        ];
        for (let i = 0; i < commentCount; i++) {
            const target = fake.pick(allCommentables);
            const author = fake.pick(users);
            await Comment.create({
                id: crypto.randomUUID(),
                author_id: author.get("id"),
                body: fake.paragraph(2),
                commentable_type: target.type,
                commentable_id: target.id,
                approved: fake.boolean(0.95),
            });
            commentBar.tick();
        }
        commentBar.complete();

        // ── Activity events ────────────────────────────────────────────────
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

        output.success("Seed complete. Try:");
        output.info(`  GET /api/workspaces/acme`);
        output.info(`  GET /api/workspaces/acme/tasks`);
        output.info(`  GET /api/feed?workspace=acme`);
        output.info(`  GET /api/search?q=${fake.words(1)[0]}`);

        await proxy.dispose();
    },
};

export default seeder;
