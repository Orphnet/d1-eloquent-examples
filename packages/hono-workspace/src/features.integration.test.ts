/// <reference types="@cloudflare/vitest-pool-workers" />
// features.integration.test.ts
//
// End-to-end verification that the newly-merged d1-eloquent features work when
// consumed by a real Hono example app. Runs against the live miniflare D1 via
// @cloudflare/vitest-pool-workers — the app's own migrations create the real
// tables, so wherever the app schema supports a feature we exercise the app's
// OWN models (Post, Task, Project, User, Workspace). Where a feature needs
// config the app models don't carry (enum cast, a global scope, a through
// relation) we declare a small dedicated demo model + table inside this file.
//
// Every value is ?-bound and every fixture uses fixed data — no randomness.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
    BaseModel,
    enumCast,
    placeholder,
    transaction,
    TransactionAborted,
} from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

import { Post } from "./models/Post";
import { Task } from "./models/Task";
import { Project } from "./models/Project";
import { User } from "./models/User";
import { Workspace } from "./models/Workspace";

// Declare the D1 binding on the pool's ambient test env (the example app doesn't
// ship a worker-configuration.d.ts, so `ProvidedEnv` would otherwise lack `DB`).
declare module "cloudflare:test" {
    interface ProvidedEnv {
        DB: D1Database;
    }
}

// ── shared app-table cleanup (child → parent, FK-safe) ──────────────────────
const APP_TABLES_CHILD_FIRST = [
    "comments",
    "tasks",
    "posts",
    "projects",
    "tags",
    "workspace_members",
    "model_revisions",
    "users",
    "workspaces",
];

async function cleanApp(): Promise<void> {
    for (const t of APP_TABLES_CHILD_FIRST) {
        await env.DB.prepare(`DELETE FROM ${t}`).run();
    }
}

/** Seed the canonical parent graph: one workspace, one user, one project. */
async function seedBase(): Promise<void> {
    await Workspace.create(env.DB, { id: "w1", slug: "w1", name: "Acme" });
    await User.create(env.DB, { id: "u1", email: "u1@x.com", name: "Ada" });
    await Project.create(env.DB, { id: "pr1", workspace_id: "w1", name: "Alpha", slug: "alpha" });
}

const idsOf = (rows: { get(k: string): unknown }[]): string[] =>
    rows.map((r) => r.get("id") as string).sort();

// withCount/withMin/withMax/withExists attach *dynamic* columns that aren't in a
// model's typed attrs — read them through a loose get() view (method-param
// bivariance makes any model assignable), no `any` required.
type LooseGet = { get(key: string): unknown };
const attr = (m: LooseGet, key: string): unknown => m.get(key);

// ════════════════════════════════════════════════════════════════════════════
// 1. increment() / decrement() — QueryBuilder + instance, extra cols, NULL→0
// ════════════════════════════════════════════════════════════════════════════
describe("1. increment() / decrement()", () => {
    beforeEach(async () => {
        await cleanApp();
        await seedBase();
        // A real "view counter" on a published post.
        await Post.create(env.DB, {
            id: "p1",
            workspace_id: "w1",
            author_id: "u1",
            slug: "p1",
            title: "Hello",
            body: "Body",
            status: "published",
            view_count: 10,
        });
    });

    it("QueryBuilder.increment() bumps by an explicit amount", async () => {
        const n = await Post.query().whereEq("id", "p1").increment(env.DB, "view_count", 5);
        // The atomic bump applied: 10 + 5 = 15.
        expect((await Post.find(env.DB, "p1"))!.get("view_count")).toBe(15);
        // `posts` carries FTS5 content-sync triggers, so D1's reported change count
        // includes the trigger cascade — assert "a row was affected", not an exact 1.
        expect(n).toBeGreaterThanOrEqual(1);
    });

    it("QueryBuilder.decrement() lowers the column", async () => {
        await Post.query().whereEq("id", "p1").decrement(env.DB, "view_count", 4);
        expect((await Post.find(env.DB, "p1"))!.get("view_count")).toBe(6);
    });

    it("QueryBuilder.increment() sets `extra` columns in the same UPDATE", async () => {
        await Post.query().whereEq("id", "p1").increment(env.DB, "view_count", 2, { title: "Touched" });
        const row = await Post.find(env.DB, "p1");
        expect(row!.get("view_count")).toBe(12);
        expect(row!.get("title")).toBe("Touched");
    });

    it("instance.increment() persists AND syncs the in-memory attribute (not left dirty)", async () => {
        const post = await Post.find(env.DB, "p1");
        await post!.increment(env.DB, "view_count", 3);
        expect(post!.get("view_count")).toBe(13); // in-memory synced
        expect(post!.isDirty("view_count")).toBe(false); // reconciled
        expect((await Post.find(env.DB, "p1"))!.get("view_count")).toBe(13); // persisted
    });

    it("treats a NULL counter as 0 via COALESCE — DB and memory agree", async () => {
        // estimated_hours is nullable; a task created without it holds SQL NULL.
        await Task.create(env.DB, { id: "t1", project_id: "pr1", title: "T", estimated_hours: null });
        const t = await Task.find(env.DB, "t1");
        await t!.increment(env.DB, "estimated_hours", 5);
        expect(t!.get("estimated_hours")).toBe(5); // COALESCE(NULL,0)+5, in memory
        const raw = await env.DB
            .prepare("SELECT estimated_hours FROM tasks WHERE id = ?")
            .bind("t1")
            .first<{ estimated_hours: number }>();
        expect(raw!.estimated_hours).toBe(5); // COALESCE(NULL,0)+5, in the DB
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. whereRelation() / orWhereRelation() + firstWhere()
// ════════════════════════════════════════════════════════════════════════════
describe("2. whereRelation() / orWhereRelation() + firstWhere()", () => {
    beforeEach(async () => {
        await cleanApp();
        await Workspace.create(env.DB, { id: "w1", slug: "w1", name: "Acme" });
        await Project.create(env.DB, { id: "pr1", workspace_id: "w1", name: "HasDone", slug: "has-done" });
        await Project.create(env.DB, { id: "pr2", workspace_id: "w1", name: "OpenOnly", slug: "open-only" });
        await Project.create(env.DB, { id: "pr3", workspace_id: "w1", name: "Empty", slug: "empty" });
        await Task.create(env.DB, { id: "t1", project_id: "pr1", title: "Done task", status: "done", priority: 9 });
        await Task.create(env.DB, { id: "t2", project_id: "pr2", title: "Open task", status: "open", priority: 1 });
    });

    it("whereRelation() keeps only parents with a matching related row (2-arg =)", async () => {
        const rows = await Project.query().whereRelation("tasks", "status", "done").get(env.DB);
        expect(rows.map((r) => r.get("id"))).toEqual(["pr1"]);
    });

    it("whereRelation() supports an explicit operator (3-arg)", async () => {
        const rows = await Project.query().whereRelation("tasks", "priority", ">", 5).get(env.DB);
        expect(rows.map((r) => r.get("id"))).toEqual(["pr1"]);
    });

    it("orWhereRelation() ORs a relation condition with a column filter", async () => {
        const rows = await Project.query()
            .whereEq("name", "OpenOnly")
            .orWhereRelation("tasks", "status", "done")
            .get(env.DB);
        expect(rows.map((r) => r.get("id")).sort()).toEqual(["pr1", "pr2"]);
    });

    it("firstWhere() returns the first matching row (2-arg) or null", async () => {
        const hit = await Project.query(env.DB).firstWhere("slug", "has-done");
        expect(hit?.get("id")).toBe("pr1");
        const miss = await Project.query(env.DB).firstWhere("slug", "nope");
        expect(miss).toBeNull();
    });

    it("firstWhere() supports an explicit operator (3-arg)", async () => {
        const hit = await Task.query(env.DB).firstWhere("priority", ">", 5);
        expect(hit?.get("id")).toBe("t1");
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. replicate() + wasRecentlyCreated
// ════════════════════════════════════════════════════════════════════════════
describe("3. replicate() + wasRecentlyCreated", () => {
    beforeEach(async () => {
        await cleanApp();
        await seedBase();
    });

    it("wasRecentlyCreated is true after create(), false after load", async () => {
        const t = await Task.create(env.DB, { id: "t1", project_id: "pr1", title: "Fresh" });
        expect(t.wasRecentlyCreated).toBe(true);
        const loaded = await Task.find(env.DB, "t1");
        expect(loaded!.wasRecentlyCreated).toBe(false);
    });

    it("wasRecentlyCreated stays false after an update (save that UPDATEs)", async () => {
        const t = await Task.find(env.DB, (await Task.create(env.DB, { id: "t2", project_id: "pr1", title: "X" })).getKey<string>()!);
        t!.set("title", "X2");
        await t!.save(env.DB);
        expect(t!.wasRecentlyCreated).toBe(false);
    });

    it("replicate() clones columns, strips the PK, and marks the clone dirty & unpersisted", async () => {
        const orig = await Task.create(env.DB, { id: "t3", project_id: "pr1", title: "Orig", priority: 3 });
        const clone = orig.replicate();
        expect(clone.get("title")).toBe("Orig");
        expect(clone.get("priority")).toBe(3);
        expect(clone.getKey()).toBeNull(); // pk stripped
        expect(clone._persisted).toBe(false); // brand-new record
        expect(clone.isDirty()).toBe(true); // copied attrs are dirty
        expect(clone.isDirty("title")).toBe(true);
    });

    it("the saved clone persists as a NEW row with a fresh key", async () => {
        const orig = await Task.create(env.DB, { id: "t4", project_id: "pr1", title: "Twin" });
        const clone = await orig.replicate().save(env.DB);
        expect(clone.getKey<string>()).toBeTruthy();
        expect(clone.getKey()).not.toBe(orig.getKey());
        expect(await Task.query().whereEq("title", "Twin").count(env.DB)).toBe(2);
        expect(clone.wasRecentlyCreated).toBe(true);
    });

    it("replicate() strips deleted_at from a soft-deleted original → fresh, un-trashed clone", async () => {
        const orig = await Task.create(env.DB, { id: "t5", project_id: "pr1", title: "Trashy" });
        await orig.delete(env.DB); // soft delete → sets deleted_at
        expect(orig.trashed()).toBe(true);
        const clone = orig.replicate();
        expect(clone.get("deleted_at")).toBeUndefined();
        expect(clone.trashed()).toBe(false);
        expect(clone.get("title")).toBe("Trashy");
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. constrained eager loading — .with({ rel: q => q.where(...) })
// ════════════════════════════════════════════════════════════════════════════
describe("4. constrained eager loading (object-map form)", () => {
    beforeEach(async () => {
        await cleanApp();
        await seedBase();
        await Task.create(env.DB, { id: "t1", project_id: "pr1", title: "done-1", status: "done" });
        await Task.create(env.DB, { id: "t2", project_id: "pr1", title: "open-1", status: "open" });
        await Task.create(env.DB, { id: "t3", project_id: "pr1", title: "done-2", status: "done" });
    });

    it("filters the eager-loaded relation with a where() constraint", async () => {
        const projects = await Project.query()
            .with({ tasks: (q) => q.where("status", "=", "done") })
            .whereEq("id", "pr1")
            .get(env.DB);
        const loaded = projects[0]!.relations.tasks as Task[];
        expect(idsOf(loaded)).toEqual(["t1", "t3"]); // t2 (open) filtered out
    });

    it("orders the eager-loaded relation", async () => {
        const projects = await Project.query()
            .with({ tasks: (q) => q.orderBy("title", "asc") })
            .whereEq("id", "pr1")
            .get(env.DB);
        const loaded = projects[0]!.relations.tasks as Task[];
        expect(loaded.map((t) => t.get("title"))).toEqual(["done-1", "done-2", "open-1"]);
    });

    it("`true` in the object form loads the relation unconstrained", async () => {
        const projects = await Project.query().with({ tasks: true }).whereEq("id", "pr1").get(env.DB);
        expect((projects[0]!.relations.tasks as Task[]).length).toBe(3);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. enumCast() — dedicated demo model (app statuses use DB CHECKs, not enumCast)
// ════════════════════════════════════════════════════════════════════════════
type DocStatus = "draft" | "published" | "archived";
interface EnumDocAttrs {
    id?: string;
    status?: DocStatus;
    level?: 1 | 2 | 3 | null;
}
class EnumDoc extends BaseModel<EnumDocAttrs> {
    static table = "feat_enum_docs";
    static timestamps = false;
    static casts = {
        status: enumCast(["draft", "published", "archived"]),
        level: enumCast([1, 2, 3]),
    } as const;
}

describe("5. enumCast()", () => {
    beforeAll(async () => {
        await env.DB.prepare(
            `CREATE TABLE IF NOT EXISTS feat_enum_docs (id TEXT PRIMARY KEY, status TEXT, level INTEGER)`,
        ).run();
    });
    beforeEach(async () => {
        await env.DB.prepare("DELETE FROM feat_enum_docs").run();
    });

    it("persists and reads back a valid enum value (string + numeric)", async () => {
        await EnumDoc.create(env.DB, { id: "d1", status: "published", level: 2 });
        const row = await EnumDoc.find(env.DB, "d1");
        expect(row!.get("status")).toBe("published");
        expect(row!.get("level")).toBe(2);
    });

    it("throws when creating with a value outside the set", async () => {
        await expect(
            // @ts-expect-error deliberately invalid enum value
            EnumDoc.create(env.DB, { id: "bad", status: "spam" }),
        ).rejects.toThrow(/Invalid enum value/i);
    });

    it("throws on save() when a set() value is out of set — persisted row untouched", async () => {
        const d = await EnumDoc.create(env.DB, { id: "d2", status: "draft" });
        // @ts-expect-error deliberately invalid
        d.set("status", "nope");
        await expect(d.save(env.DB)).rejects.toThrow(/Invalid enum value/i);
        const stored = await env.DB
            .prepare("SELECT status FROM feat_enum_docs WHERE id = ?")
            .bind("d2")
            .first<{ status: string }>();
        expect(stored!.status).toBe("draft");
    });

    it("lets null pass through on both write and read", async () => {
        await EnumDoc.create(env.DB, { id: "d3", status: "draft", level: null });
        expect((await EnumDoc.find(env.DB, "d3"))!.get("level")).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. withMin() / withMax() / withExists() relation aggregates
// ════════════════════════════════════════════════════════════════════════════
describe("6. withMin() / withMax() / withExists()", () => {
    beforeEach(async () => {
        await cleanApp();
        await seedBase();
        await Project.create(env.DB, { id: "pr2", workspace_id: "w1", name: "Bare", slug: "bare" });
        await Task.create(env.DB, { id: "t1", project_id: "pr1", title: "lo", priority: 1 });
        await Task.create(env.DB, { id: "t2", project_id: "pr1", title: "hi", priority: 8 });
        await Task.create(env.DB, { id: "t3", project_id: "pr1", title: "mid", priority: 5 });
        // pr2 deliberately has no tasks.
    });

    it("withMin/withMax attach MIN/MAX of a related column", async () => {
        const projects = await Project.query()
            .withMin("tasks", "priority")
            .withMax("tasks", "priority")
            .orderBy("id")
            .get(env.DB);
        const pr1 = projects.find((p) => p.get("id") === "pr1")!;
        expect(attr(pr1, "tasks_priority_min")).toBe(1);
        expect(attr(pr1, "tasks_priority_max")).toBe(8);
    });

    it("withMax honours a custom alias", async () => {
        const projects = await Project.query().withMax("tasks", "priority", "top").whereEq("id", "pr1").get(env.DB);
        expect(attr(projects[0]!, "top")).toBe(8);
    });

    it("withExists attaches a concrete 0/1 flag (never null for zero rows)", async () => {
        const projects = await Project.query().withExists("tasks").orderBy("id").get(env.DB);
        const pr1 = projects.find((p) => p.get("id") === "pr1")!;
        const pr2 = projects.find((p) => p.get("id") === "pr2")!;
        expect(attr(pr1, "tasks_exists")).toBe(1);
        expect(attr(pr2, "tasks_exists")).toBe(0);
        expect(attr(pr2, "tasks_exists")).not.toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. intersect() / except() set operators (with soft-delete scoping)
// ════════════════════════════════════════════════════════════════════════════
describe("7. intersect() / except() (soft-delete scoped)", () => {
    beforeEach(async () => {
        await cleanApp();
        await seedBase();
        // Post carries softDeletes; intersect/except must scope BOTH operands.
        await Post.create(env.DB, { id: "p1", workspace_id: "w1", author_id: "u1", slug: "p1", title: "a", body: "b", status: "published", view_count: 100 });
        await Post.create(env.DB, { id: "p2", workspace_id: "w1", author_id: "u1", slug: "p2", title: "b", body: "b", status: "published", view_count: 5 });
        await Post.create(env.DB, { id: "p3", workspace_id: "w1", author_id: "u1", slug: "p3", title: "c", body: "b", status: "archived", view_count: 100 });
        // p4 matches BOTH predicates but is soft-deleted → must never appear.
        await Post.create(env.DB, { id: "p4", workspace_id: "w1", author_id: "u1", slug: "p4", title: "d", body: "b", status: "published", view_count: 100 });
        await (await Post.find(env.DB, "p4"))!.delete(env.DB);
    });

    it("intersect() keeps rows present in both queries, excluding the trashed row", async () => {
        const rows = await Post.query()
            .whereEq("status", "published")
            .intersect(Post.query().whereEq("view_count", 100))
            .get(env.DB);
        const ids = rows.map((r) => r.get("id"));
        expect(ids).toEqual(["p1"]); // published ∩ view_count=100, minus trashed p4
        expect(ids).not.toContain("p4");
    });

    it("except() keeps first-query rows absent from the second, excluding the trashed row", async () => {
        const rows = await Post.query()
            .whereEq("status", "published")
            .except(Post.query().whereEq("view_count", 100))
            .get(env.DB);
        const ids = rows.map((r) => r.get("id"));
        expect(ids).toEqual(["p2"]); // published EXCEPT view_count=100 → p2 (p4 trashed)
        expect(ids).not.toContain("p4");
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. date-part wheres — whereDate/whereTime/whereYear/whereMonth/whereDay
// ════════════════════════════════════════════════════════════════════════════
describe("8. date-part where helpers", () => {
    beforeEach(async () => {
        await cleanApp();
        await seedBase();
        const base = { workspace_id: "w1", author_id: "u1", body: "b", status: "published" as const };
        await Post.create(env.DB, { ...base, id: "p1", slug: "p1", title: "t1", published_at: "2026-01-15 09:30:00" });
        await Post.create(env.DB, { ...base, id: "p2", slug: "p2", title: "t2", published_at: "2026-01-20 14:00:00" });
        await Post.create(env.DB, { ...base, id: "p3", slug: "p3", title: "t3", published_at: "2025-03-05 09:30:00" });
    });

    it("whereDate matches a calendar day", async () => {
        const rows = await Post.query().whereDate("published_at", "2026-01-15").get(env.DB);
        expect(idsOf(rows)).toEqual(["p1"]);
    });

    it("whereMonth matches a numeric month (zero-padded internally)", async () => {
        const rows = await Post.query().whereMonth("published_at", 1).get(env.DB);
        expect(idsOf(rows)).toEqual(["p1", "p2"]);
    });

    it("whereYear matches a year", async () => {
        const rows = await Post.query().whereYear("published_at", 2026).get(env.DB);
        expect(idsOf(rows)).toEqual(["p1", "p2"]);
    });

    it("whereDay matches a day-of-month", async () => {
        const rows = await Post.query().whereDay("published_at", 15).get(env.DB);
        expect(idsOf(rows)).toEqual(["p1"]);
    });

    it("whereTime matches a wall-clock time", async () => {
        const rows = await Post.query().whereTime("published_at", "09:30:00").get(env.DB);
        expect(idsOf(rows)).toEqual(["p1", "p3"]);
    });

    it("whereTime supports an operator form", async () => {
        const rows = await Post.query().whereTime("published_at", ">=", "10:00:00").get(env.DB);
        expect(idsOf(rows)).toEqual(["p2"]);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. user-defined global scopes + withoutGlobalScope(s) — tenant demo model
// ════════════════════════════════════════════════════════════════════════════
interface ScopedDocAttrs {
    id?: string;
    tenant?: string;
    title?: string;
}
let currentTenant = "t1";
class ScopedDoc extends BaseModel<ScopedDocAttrs> {
    static table = "feat_scoped_docs";
    static timestamps = false;
    static globalScopes = {
        tenant: (q: QueryBuilder<ScopedDoc>) => q.whereEq("tenant", currentTenant),
    };
}

describe("9. global scopes + withoutGlobalScope(s)", () => {
    beforeAll(async () => {
        await env.DB.prepare(
            `CREATE TABLE IF NOT EXISTS feat_scoped_docs (id TEXT PRIMARY KEY, tenant TEXT, title TEXT)`,
        ).run();
    });
    beforeEach(async () => {
        currentTenant = "t1";
        await env.DB.prepare("DELETE FROM feat_scoped_docs").run();
        await ScopedDoc.create(env.DB, { id: "d1", tenant: "t1", title: "A" });
        await ScopedDoc.create(env.DB, { id: "d2", tenant: "t1", title: "B" });
        await ScopedDoc.create(env.DB, { id: "d3", tenant: "t2", title: "A" });
    });

    it("auto-applies to every query and tracks external context", async () => {
        expect(idsOf(await ScopedDoc.query().get(env.DB))).toEqual(["d1", "d2"]);
        currentTenant = "t2";
        expect(idsOf(await ScopedDoc.query().get(env.DB))).toEqual(["d3"]);
    });

    it("composes (AND) with user where clauses — no cross-tenant leak", async () => {
        const rows = await ScopedDoc.query().whereEq("title", "A").get(env.DB);
        expect(idsOf(rows)).toEqual(["d1"]); // t1 AND title=A (not d3 which is t2)
    });

    it("withoutGlobalScope(name) removes just that scope", async () => {
        expect(idsOf(await ScopedDoc.query().withoutGlobalScope("tenant").get(env.DB))).toEqual(["d1", "d2", "d3"]);
    });

    it("withoutGlobalScopes() removes all scopes", async () => {
        expect(idsOf(await ScopedDoc.query().withoutGlobalScopes().get(env.DB))).toEqual(["d1", "d2", "d3"]);
    });

    it("is applied to count() too", async () => {
        expect(await ScopedDoc.query().count(env.DB)).toBe(2);
        expect(await ScopedDoc.query().withoutGlobalScopes().count(env.DB)).toBe(3);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. hasManyThrough / hasOneThrough — Country → User → Post demo chain
// ════════════════════════════════════════════════════════════════════════════
interface HtCountryAttrs { id?: string; name?: string }
interface HtUserAttrs { id?: string; country_id?: string; name?: string }
interface HtPostAttrs { id?: string; user_id?: string; title?: string }

class HtUser extends BaseModel<HtUserAttrs> {
    static table = "feat_ht_users";
    static timestamps = false;
}
class HtPost extends BaseModel<HtPostAttrs> {
    static table = "feat_ht_posts";
    static timestamps = false;
}
class HtCountry extends BaseModel<HtCountryAttrs> {
    static table = "feat_ht_countries";
    static timestamps = false;
    static relations: Record<string, TRelationDefinition> = {
        posts: {
            type: "hasManyThrough",
            model: () => HtPost,
            through: () => HtUser,
            firstKey: "country_id", // feat_ht_users.country_id → country
            secondKey: "user_id", // feat_ht_posts.user_id → user
        },
        latestPost: {
            type: "hasOneThrough",
            model: () => HtPost,
            through: () => HtUser,
            firstKey: "country_id",
            secondKey: "user_id",
        },
    };
}

describe("10. hasManyThrough / hasOneThrough", () => {
    beforeAll(async () => {
        for (const sql of [
            `CREATE TABLE IF NOT EXISTS feat_ht_countries (id TEXT PRIMARY KEY, name TEXT)`,
            `CREATE TABLE IF NOT EXISTS feat_ht_users (id TEXT PRIMARY KEY, country_id TEXT, name TEXT)`,
            `CREATE TABLE IF NOT EXISTS feat_ht_posts (id TEXT PRIMARY KEY, user_id TEXT, title TEXT)`,
        ]) {
            await env.DB.prepare(sql).run();
        }
    });
    beforeEach(async () => {
        for (const t of ["feat_ht_countries", "feat_ht_users", "feat_ht_posts"]) {
            await env.DB.prepare(`DELETE FROM ${t}`).run();
        }
        await HtCountry.create(env.DB, { id: "c1", name: "US" });
        await HtCountry.create(env.DB, { id: "c2", name: "UK" });
        await HtUser.create(env.DB, { id: "u1", country_id: "c1", name: "a" });
        await HtUser.create(env.DB, { id: "u2", country_id: "c1", name: "b" });
        await HtUser.create(env.DB, { id: "u3", country_id: "c2", name: "c" });
        await HtPost.create(env.DB, { id: "p1", user_id: "u1", title: "P1" });
        await HtPost.create(env.DB, { id: "p2", user_id: "u1", title: "P2" });
        await HtPost.create(env.DB, { id: "p3", user_id: "u2", title: "P3" });
        await HtPost.create(env.DB, { id: "p4", user_id: "u3", title: "P4" });
    });

    it("hasManyThrough eager-loads related rows grouped per parent, across the through table", async () => {
        const countries = await HtCountry.query().with(["posts"]).orderBy("id").get(env.DB);
        const c1 = countries.find((c) => c.get("id") === "c1")!;
        const c2 = countries.find((c) => c.get("id") === "c2")!;
        expect(idsOf(c1.relations.posts as HtPost[])).toEqual(["p1", "p2", "p3"]); // via u1, u2
        expect(idsOf(c2.relations.posts as HtPost[])).toEqual(["p4"]); // via u3
    });

    it("hasManyThrough lazy-loads via related()", async () => {
        const c1 = await HtCountry.find(env.DB, "c1");
        const posts = (await c1!.related("posts").get(env.DB)) as HtPost[];
        expect(idsOf(posts)).toEqual(["p1", "p2", "p3"]);
    });

    it("hasManyThrough constrains through the with() object-map form", async () => {
        const countries = await HtCountry.query()
            .with({ posts: (q) => q.where("title", "=", "P1") })
            .whereEq("id", "c1")
            .get(env.DB);
        expect(idsOf(countries[0]!.relations.posts as HtPost[])).toEqual(["p1"]);
    });

    it("hasOneThrough eager-loads a single row, null for a parent with none", async () => {
        await HtCountry.create(env.DB, { id: "c3", name: "empty" });
        const countries = await HtCountry.query().with(["latestPost"]).orderBy("id").get(env.DB);
        const c1 = countries.find((c) => c.get("id") === "c1")!;
        const c3 = countries.find((c) => c.get("id") === "c3")!;
        expect(c1.relations.latestPost).not.toBeNull();
        expect(["p1", "p2", "p3"]).toContain((c1.relations.latestPost as HtPost).get("id"));
        expect(c3.relations.latestPost).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 11. prepared queries — prepare() + placeholder(), reused with different params
// ════════════════════════════════════════════════════════════════════════════
describe("11. prepared queries — prepare() + placeholder()", () => {
    beforeEach(async () => {
        await cleanApp();
        await User.create(env.DB, { id: "u1", email: "a@x.com", name: "A", is_admin: true });
        await User.create(env.DB, { id: "u2", email: "b@x.com", name: "B", is_admin: false });
        await User.create(env.DB, { id: "u3", email: "c@x.com", name: "C", is_admin: true });
    });

    it("compiles once and reuses with different params", async () => {
        const byEmail = User.query().whereEq("email", placeholder("email")).prepare(env.DB);
        expect((await byEmail.first({ email: "a@x.com" }))!.get("id")).toBe("u1");
        expect((await byEmail.first({ email: "b@x.com" }))!.get("id")).toBe("u2");
        expect(await byEmail.first({ email: "missing@x.com" })).toBeNull();
    });

    it("mixes static values with placeholders", async () => {
        const adminByEmail = User.query()
            .whereEq("is_admin", true) // static (cast to 1)
            .where("email", "=", placeholder("email")) // placeholder
            .prepare(env.DB);
        expect((await adminByEmail.first({ email: "a@x.com" }))!.get("id")).toBe("u1"); // admin + a
        expect(await adminByEmail.first({ email: "b@x.com" })).toBeNull(); // b is not admin
    });

    it("get() returns multiple hydrated models and carries the soft-delete scope", async () => {
        // u3 will be trashed → the prepared SELECT must exclude it (User softDeletes).
        await (await User.find(env.DB, "u3"))!.delete(env.DB);
        const admins = User.query().whereEq("is_admin", placeholder("flag")).orderBy("id").prepare(env.DB);
        const rows = await admins.get({ flag: 1 }); // placeholders bind RAW (no cast) → pass 1
        expect(rows.map((r) => r.get("id"))).toEqual(["u1"]); // u3 trashed & scoped out
        expect(rows[0]!.get("is_admin")).toBe(true); // result still hydrated
    });

    it("throws when a placeholder value is missing", async () => {
        const q = User.query().whereEq("email", placeholder("email")).prepare(env.DB);
        await expect(q.first({})).rejects.toThrow(/placeholder 'email'/i);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 12. transactions — transaction(db, async (tx) => {...}) atomic unit-of-work
// ════════════════════════════════════════════════════════════════════════════
describe("12. transactions — atomic unit-of-work", () => {
    beforeEach(async () => {
        await cleanApp();
        await Workspace.create(env.DB, { id: "w1", slug: "w1", name: "Acme" });
    });

    it("creates related rows across tables atomically (parent + child)", async () => {
        await transaction(env.DB, async (tx) => {
            await tx.create(User, { id: "au", email: "author@x.com", name: "Author" });
            await tx.create(Post, {
                id: "ap",
                workspace_id: "w1",
                author_id: "au",
                slug: "atomic",
                title: "Atomic",
                body: "b",
                status: "draft",
            });
        });
        expect(await User.query().whereEq("id", "au").count(env.DB)).toBe(1);
        expect(await Post.query().whereEq("id", "ap").count(env.DB)).toBe(1);
    });

    it("rolls back EVERYTHING when a statement fails (NOT NULL violation)", async () => {
        await expect(
            transaction(env.DB, async (tx) => {
                await tx.create(User, { id: "ok", email: "ok@x.com", name: "Ok" });
                // email is NOT NULL → this statement fails the whole batch.
                await tx.create(User, { id: "bad", name: "Bad" } as never);
            }),
        ).rejects.toThrow();
        expect(await User.query().count(env.DB)).toBe(0); // the valid insert was discarded too
    });

    it("commits a loaded-instance update AND a delete atomically", async () => {
        await User.create(env.DB, { id: "ua", email: "ua@x.com", name: "A" });
        await User.create(env.DB, { id: "ub", email: "ub@x.com", name: "B" });
        const ua = await User.find(env.DB, "ua");
        await transaction(env.DB, async (tx) => {
            ua!.set("name", "A2");
            await tx.save(ua!); // UPDATE by PK
            tx.delete(User.query().whereEq("id", "ub")); // DELETE by query
        });
        expect((await User.find(env.DB, "ua"))!.get("name")).toBe("A2");
        expect(await User.find(env.DB, "ub")).toBeNull();
    });

    it("a before-hook returning false aborts the whole tx (TransactionAborted)", async () => {
        class GuardedUser extends BaseModel<{ id?: string; email?: string; name?: string }> {
            static table = "users";
            static hooks = { creating: () => false as const };
        }
        await expect(
            transaction(env.DB, async (tx) => {
                await tx.create(User, { id: "before", email: "before@x.com", name: "Before" });
                await tx.create(GuardedUser, { id: "guard", email: "guard@x.com", name: "Guard" }); // creating → false
            }),
        ).rejects.toBeInstanceOf(TransactionAborted);
        expect(await User.query().count(env.DB)).toBe(0); // earlier op discarded too
    });
});
