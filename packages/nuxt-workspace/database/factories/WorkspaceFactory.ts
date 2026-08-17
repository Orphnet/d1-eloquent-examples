import { Factory, fake } from "@orphnet/d1-eloquent/cli";

/**
 * Factory for the canonical demo workspace + its child rows. Factories use the
 * built-in seeded faker so runs are reproducible (`fake.seed(n)`).
 *
 * These factories power the CLI seeders (`bunx d1-eloquent seed`). The Nitro
 * runtime route `/api/admin/seed` seeds the same shape directly against the
 * Workers D1 binding for the live demo.
 */
export class WorkspaceFactory extends Factory<Record<string, unknown>> {
    readonly table = "workspaces";
    definition() {
        return {
            id: fake.uuid(),
            slug: fake.slug(2),
            name: fake.company(),
            settings: JSON.stringify({ theme: "default", invite_only: fake.boolean() }),
            created_at: fake.now(),
            updated_at: fake.now(),
        };
    }
}

export class UserFactory extends Factory<Record<string, unknown>> {
    readonly table = "users";
    definition() {
        return {
            id: fake.uuid(),
            email: fake.email().toLowerCase(),
            name: fake.name(),
            avatar_url: `https://i.pravatar.cc/100?u=${fake.hex(4)}`,
            is_admin: 0,
            created_at: fake.now(),
            updated_at: fake.now(),
        };
    }
}

export class TagFactory extends Factory<Record<string, unknown>> {
    readonly table = "tags";
    definition() {
        return {
            id: fake.uuid(),
            workspace_id: "", // set via override
            label: fake.pick(["urgent", "bug", "feature", "docs", "design", "ops"]),
            color: "#" + fake.hex(3),
            created_at: fake.now(),
            updated_at: fake.now(),
        };
    }
}

export class ProjectFactory extends Factory<Record<string, unknown>> {
    readonly table = "projects";
    definition() {
        return {
            id: fake.uuid(),
            workspace_id: "",
            name: fake.company(),
            slug: fake.slug(2),
            description: fake.sentence(),
            color: "#" + fake.hex(3),
            created_at: fake.now(),
            updated_at: fake.now(),
        };
    }
}

export class TaskFactory extends Factory<Record<string, unknown>> {
    readonly table = "tasks";
    definition() {
        const status = fake.pick(["open", "open", "in_progress", "done"]);
        return {
            id: fake.uuid(),
            project_id: "",
            parent_id: null,
            assignee_id: null,
            title: fake.sentence(6).replace(".", ""),
            description: fake.paragraph(2),
            status,
            priority: fake.int(0, 3),
            estimated_hours: fake.float(0.5, 16, 1),
            due_at: null,
            completed_at: status === "done" ? fake.now() : null,
            created_at: fake.now(),
            updated_at: fake.now(),
        };
    }
}

export class PostFactory extends Factory<Record<string, unknown>> {
    readonly table = "posts";
    definition() {
        const published = fake.boolean(0.7);
        return {
            id: fake.uuid(),
            workspace_id: "",
            author_id: "",
            slug: `post-${fake.slug(3)}`,
            title: fake.sentence(7).replace(".", ""),
            body: fake.paragraph(4) + "\n\n" + fake.paragraph(4),
            status: published ? "published" : "draft",
            metadata: JSON.stringify({
                reading_time_minutes: fake.int(2, 12),
                excerpt: fake.sentence(),
            }),
            published_at: published ? fake.pastDate(60) : null,
            view_count: published ? fake.int(10, 2000) : 0,
            created_at: fake.now(),
            updated_at: fake.now(),
        };
    }
}
