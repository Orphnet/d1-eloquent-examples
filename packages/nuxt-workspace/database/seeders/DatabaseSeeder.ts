import { fake, output } from "@orphnet/d1-eloquent/cli";
import type { TSeeder, TSeederOpts } from "@orphnet/d1-eloquent/cli";

import {
    WorkspaceFactory,
    UserFactory,
    TagFactory,
    ProjectFactory,
    TaskFactory,
    PostFactory,
} from "../factories/WorkspaceFactory.ts";
import {
    WorkspaceSettingFactory,
    MetricEventFactory,
    ReleaseFactory,
} from "../factories/AnalyticsFactory.ts";

/**
 * CLI seeder — run with `bunx d1-eloquent seed` (optionally `--fresh`).
 *
 * Mirrors the canonical `acme` workspace produced by the runtime route
 * `/api/admin/seed`. Note: explicit `.ts` import extensions are required under
 * Node 22 ESM resolution (see the d1-eloquent gotchas).
 *
 * Each `createMany` runs a batched insert. Overrides are applied per-row to
 * stitch the foreign keys together.
 */
const seeder: TSeeder = {
    name: "DatabaseSeeder",
    description: "Seeds the acme workspace: users, tags, projects, tasks, posts, settings, metrics, releases.",
    run: async (opts: TSeederOpts) => {
        fake.seed(20260517);

        // ── Workspace ───────────────────────────────────────────────────────
        const ws = await new WorkspaceFactory().create(opts, {
            slug: "acme",
            name: "Acme HQ",
            settings: JSON.stringify({ theme: "default", invite_only: false }),
        });
        const wsId = ws.id as string;

        // ── Users ─────────────────────────────────────────────────────────────
        const users = await new UserFactory().createMany(opts, 8, (i) => ({
            is_admin: i === 0 ? 1 : 0,
        }));

        // ── Tags ──────────────────────────────────────────────────────────────
        const tags = await new TagFactory().createMany(opts, 8, () => ({ workspace_id: wsId }));

        // ── Projects + Tasks ──────────────────────────────────────────────────
        const projects = await new ProjectFactory().createMany(opts, 3, (i) => ({
            workspace_id: wsId,
            name: ["Platform", "Mobile App", "Marketing Site"][i],
            slug: ["platform", "mobile", "marketing"][i],
        }));

        let taskCount = 0;
        for (const p of projects) {
            const created = await new TaskFactory().createMany(opts, 12, () => ({
                project_id: p.id as string,
                assignee_id: fake.pick(users).id as string,
            }));
            taskCount += created.length;
        }

        // ── Posts ─────────────────────────────────────────────────────────────
        const posts = await new PostFactory().createMany(opts, 10, () => ({
            workspace_id: wsId,
            author_id: fake.pick(users).id as string,
        }));

        // ── Settings (one JSON-heavy row) ─────────────────────────────────────
        await new WorkspaceSettingFactory().create(opts, {
            workspace_id: wsId,
            feature_flags: JSON.stringify(["beta-search", "ai-summaries", "metrics-v2"]),
            seat_limit: 25,
            storage_quota_gb: 50.5,
        });

        // ── Metric events (14 days × 4 metrics) ───────────────────────────────
        const metrics = await new MetricEventFactory().createMany(opts, 14 * 4, () => ({
            workspace_id: wsId,
            project_id: fake.boolean(0.6) ? (fake.pick(projects).id as string) : null,
        }));

        // ── Releases (3 per project) ──────────────────────────────────────────
        let releaseCount = 0;
        for (const p of projects) {
            const created = await new ReleaseFactory().createMany(opts, 3, (i) => ({
                project_id: p.id as string,
                version: `1.${i}.0`,
                channel: ["stable", "beta", "canary"][i],
            }));
            releaseCount += created.length;
        }

        output.card("Seeded acme workspace", {
            Users: String(users.length),
            Tags: String(tags.length),
            Projects: String(projects.length),
            Tasks: String(taskCount),
            Posts: String(posts.length),
            Metrics: String(metrics.length),
            Releases: String(releaseCount),
        });
    },
};

export default seeder;
