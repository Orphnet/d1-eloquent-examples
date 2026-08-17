/**
 * /api/features - a live, curlable showcase of the beta.3 d1-eloquent features.
 *
 * Every one of these features was previously reachable ONLY from
 * `src/features.integration.test.ts`. This route group promotes each into a
 * real HTTP endpoint that RUNS the feature against the demo's D1 and returns
 *
 *     { feature, whatItShows, snippet, result }
 *
 * so the response doubles as copy-paste documentation: `snippet` is the exact
 * d1-eloquent call, `result` is what that call actually produced just now.
 *
 * The API calls are lifted verbatim from the integration test (the canonical
 * usage reference). Each endpoint is SELF-CONTAINED: it resets and re-seeds its
 * own isolated fixtures (a dedicated `showcase` workspace with `sw_`-prefixed
 * ids, or dedicated `showcase_*` tables) on every call, so it is deterministic
 * and never touches the demo's real seeded data.
 */
import { Hono } from "hono";
import { BaseModel, placeholder, transaction, TransactionAborted } from "@orphnet/d1-eloquent";

import {
    ActivityEvent,
    Post,
    Project,
    Task,
    User,
    Workspace,
} from "../models";
import {
    ShowcaseArticle,
    ShowcaseCitizen,
    ShowcaseCountry,
    ShowcaseDoc,
    ShowcaseDocLenient,
    ShowcaseDocRaw,
    ShowcaseTenantDoc,
    setShowcaseTenant,
    type ShowcaseDocStatus,
} from "../models/showcase";
import { ok } from "../lib/response";
import type { AppEnv } from "../lib/env";

export const featureRoutes = new Hono<AppEnv>();

// ── shared helpers ──────────────────────────────────────────────────────────

/** Isolated showcase fixture ids - never collide with the UUID-keyed demo seed. */
const SW = {
    ws: "sw_ws",
    slug: "showcase",
    user: "sw_u1",
    projects: ["sw_pr1", "sw_pr2", "sw_pr3"] as const,
} as const;

// withMin/withMax/withExists attach dynamic columns absent from a model's typed
// attrs - read them through a loose get() view (no `any` required).
type LooseGet = { get(key: string): unknown };
const attr = (m: LooseGet, key: string): unknown => m.get(key);
const num = (v: unknown): number | null => (v == null ? null : (v as number));
const idsOf = (rows: LooseGet[]): string[] => rows.map((r) => r.get("id") as string).sort();

/**
 * Hard-clear (ignoring soft-delete) the showcase workspace graph, child → parent,
 * then re-create the canonical parents (workspace + user + one project). Endpoints
 * add their own children afterwards. Idempotent - safe to call every request.
 */
async function resetShowcase(db: D1Database): Promise<void> {
    for (const pid of SW.projects) {
        await Task.query().whereEq("project_id", pid).withTrashed().delete(db);
    }
    await Post.query().whereEq("workspace_id", SW.ws).withTrashed().delete(db);
    await ActivityEvent.query().whereEq("workspace_id", SW.ws).delete(db);
    await Project.query().whereEq("workspace_id", SW.ws).withTrashed().delete(db);
    await User.query().whereEq("id", SW.user).withTrashed().delete(db);
    await Workspace.query().whereEq("id", SW.ws).withTrashed().delete(db);

    await Workspace.create(db, { id: SW.ws, slug: SW.slug, name: "Showcase" });
    await User.create(db, { id: SW.user, email: "showcase@example.com", name: "Showcase User" });
}

/** A before-hook that vetoes creation - used to prove a tx aborts (feature 13). */
class GuardedShowcaseUser extends BaseModel<{ id?: string; email?: string; name?: string }> {
    static table = "users";
    static hooks = { creating: () => false as const };
}

// ── feature catalogue (drives GET /api/features and the manifest) ───────────
interface FeatureCard {
    n: number;
    key: string;
    path: string;
    feature: string;
    whatItShows: string;
}

const FEATURES: FeatureCard[] = [
    {
        n: 1,
        key: "counters",
        path: "/api/features/counters",
        feature: "increment() / decrement()",
        whatItShows:
            "Atomic column bumps at the QueryBuilder AND instance level, extra columns in the same UPDATE, in-memory attribute sync, and NULL→0 COALESCE hardening.",
    },
    {
        n: 2,
        key: "where-relation",
        path: "/api/features/where-relation",
        feature: "whereRelation() / orWhereRelation() / firstWhere()",
        whatItShows:
            "Filter parents by a condition on a related row (2-arg = and 3-arg operator forms), OR a relation condition with a column filter, and fetch the first match (or null).",
    },
    {
        n: 3,
        key: "replicate",
        path: "/api/features/replicate",
        feature: "replicate() + wasRecentlyCreated",
        whatItShows:
            "Clone a row (PK + deleted_at stripped, copied attrs dirty & unpersisted), persist it as a fresh record, and read the wasRecentlyCreated flag across create vs load.",
    },
    {
        n: 4,
        key: "constrained-eager",
        path: "/api/features/constrained-eager",
        feature: "constrained eager loading - .with({ rel: q => q… })",
        whatItShows:
            "Filter and order an eager-loaded relation with a callback, plus `true` for an unconstrained load.",
    },
    {
        n: 5,
        key: "enum-cast",
        path: "/api/features/enum-cast",
        feature: "enumCast() (+ onInvalidRead)",
        whatItShows:
            "Round-trip a validated enum, reject an out-of-set write, and the beta.3 onInvalidRead:'null' opt-in that reads a legacy/bad value back as null instead of throwing.",
    },
    {
        n: 6,
        key: "relation-aggregates",
        path: "/api/features/relation-aggregates",
        feature: "withMin() / withMax() / withExists()",
        whatItShows:
            "Attach MIN/MAX of a related column (with a custom alias) and a concrete 0/1 existence flag that is never null, even for parents with zero related rows.",
    },
    {
        n: 7,
        key: "set-operators",
        path: "/api/features/set-operators",
        feature: "intersect() / except()",
        whatItShows:
            "SQL INTERSECT / EXCEPT between two model queries, with the soft-delete scope applied to BOTH operands so a trashed row never leaks in.",
    },
    {
        n: 8,
        key: "date-parts",
        path: "/api/features/date-parts",
        feature: "whereDate / whereTime / whereYear / whereMonth / whereDay",
        whatItShows:
            "Filter a datetime column by calendar day, wall-clock time, year, month, or day-of-month (value and operator forms).",
    },
    {
        n: 9,
        key: "global-scopes",
        path: "/api/features/global-scopes",
        feature: "global scopes + withoutGlobalScope(s)",
        whatItShows:
            "A model-defined scope auto-applied to every query (tracking external context), AND-composing with user where clauses, and per-name / all opt-out.",
    },
    {
        n: 10,
        key: "through-relations",
        path: "/api/features/through-relations",
        feature: "hasManyThrough / hasOneThrough",
        whatItShows:
            "Reach a grandchild across an intermediate table - eager-loaded grouped per parent, lazy-loaded via related(), constrained, and hasOneThrough (null for a parent with none).",
    },
    {
        n: 11,
        key: "prepared-queries",
        path: "/api/features/prepared-queries",
        feature: "prepare() + placeholder()",
        whatItShows:
            "Compile a query once and reuse it with different params, mix static values with placeholders, carry the soft-delete scope, and throw on a missing placeholder.",
    },
    {
        n: 12,
        key: "schema-diff",
        path: "(docs) README §Schema-diff migrations + bun run db:generate",
        feature: "schema-diff generate CLI",
        whatItShows:
            "A build-time CLI (not an HTTP route): `d1-eloquent generate` diffs model columns against migration history and emits an ALTER migration. See the committed sample migration …102400_alter_showcase_docs_add_tags.ts and the README section.",
    },
    {
        n: 13,
        key: "transactions",
        path: "/api/features/transactions",
        feature: "transaction() - atomic unit-of-work",
        whatItShows:
            "Commit related writes across tables atomically, roll EVERYTHING back on a constraint violation, and abort the whole tx when a before-hook returns false (TransactionAborted).",
    },
    {
        n: 14,
        key: "transaction-counters",
        path: "/api/features/transaction-counters",
        feature: "tx.increment() / tx.decrement()",
        whatItShows:
            "Atomic counter adjustments queued inside a transaction alongside another write, committing or rolling back together (with NULL→0 hardening carried into the tx path).",
    },
];

// ── index ───────────────────────────────────────────────────────────────────
featureRoutes.get("/", (c) =>
    ok(c, {
        title: "beta.3 feature showcase",
        howToUse:
            "curl any endpoint below; each runs the feature live and returns { feature, whatItShows, snippet, result }.",
        count: FEATURES.length,
        features: FEATURES.map((f) => ({
            n: f.n,
            feature: f.feature,
            path: f.path,
            whatItShows: f.whatItShows,
        })),
    }),
);

// ── 1. increment() / decrement() ────────────────────────────────────────────
featureRoutes.get("/counters", async (c) => {
    const db = c.env.DB;
    await resetShowcase(db);
    await Project.create(db, { id: "sw_pr1", workspace_id: SW.ws, name: "Alpha", slug: "sw-alpha" });
    await Post.create(db, {
        id: "sw_c1", workspace_id: SW.ws, author_id: SW.user, slug: "sw-c1",
        title: "Hello", body: "Body", status: "published", view_count: 10,
    });

    // QueryBuilder.increment / decrement (atomic, in one UPDATE).
    await Post.query().whereEq("id", "sw_c1").increment(db, "view_count", 5); // 10 → 15
    const afterInc = (await Post.find(db, "sw_c1"))!.get("view_count");
    await Post.query().whereEq("id", "sw_c1").decrement(db, "view_count", 4); // 15 → 11
    const afterDec = (await Post.find(db, "sw_c1"))!.get("view_count");

    // increment() can set `extra` columns in the same statement.
    await Post.query().whereEq("id", "sw_c1").increment(db, "view_count", 2, { title: "Touched" }); // 11 → 13
    const touched = (await Post.find(db, "sw_c1"))!;
    // Snapshot before the next mutation - `touched` is a live reference.
    const afterExtraColumns = { viewCount: touched.get("view_count"), title: touched.get("title") };

    // instance.increment() persists AND syncs the in-memory attribute (not left dirty).
    await touched.increment(db, "view_count", 3); // 13 → 16
    const inMemory = touched.get("view_count");
    const stillDirty = touched.isDirty("view_count");

    // A NULL counter is treated as 0 via COALESCE - DB and memory agree.
    await Task.create(db, { id: "sw_ct", project_id: "sw_pr1", title: "T", estimated_hours: null });
    const t = (await Task.find(db, "sw_ct"))!;
    await t.increment(db, "estimated_hours", 5); // COALESCE(NULL,0)+5

    return ok(c, {
        feature: "increment() / decrement()",
        whatItShows: FEATURES[0]!.whatItShows,
        snippet:
            'await Post.query().whereEq("id", id).increment(db, "view_count", 5);\n' +
            'await post.increment(db, "view_count", 3); // syncs in-memory attr, reconciles isDirty\n' +
            'await task.increment(db, "estimated_hours", 5); // COALESCE(NULL,0)+5',
        result: {
            startValue: 10,
            afterQueryBuilderIncrement: afterInc,
            afterQueryBuilderDecrement: afterDec,
            afterIncrementWithExtraColumns: afterExtraColumns,
            afterInstanceIncrement: inMemory,
            instanceStillDirty: stillDirty,
            nullCounterCoalescedToZeroThenPlusFive: t.get("estimated_hours"),
        },
    });
});

// ── 2. whereRelation / orWhereRelation / firstWhere ─────────────────────────
featureRoutes.get("/where-relation", async (c) => {
    const db = c.env.DB;
    await resetShowcase(db);
    await Project.create(db, { id: "sw_pr1", workspace_id: SW.ws, name: "HasDone", slug: "sw-has-done" });
    await Project.create(db, { id: "sw_pr2", workspace_id: SW.ws, name: "OpenOnly", slug: "sw-open-only" });
    await Project.create(db, { id: "sw_pr3", workspace_id: SW.ws, name: "Empty", slug: "sw-empty" });
    await Task.create(db, { id: "sw_t1", project_id: "sw_pr1", title: "Done task", status: "done", priority: 9 });
    await Task.create(db, { id: "sw_t2", project_id: "sw_pr2", title: "Open task", status: "open", priority: 1 });

    const hasDone = await Project.query().whereRelation("tasks", "status", "done").get(db);
    const highPriority = await Project.query().whereRelation("tasks", "priority", ">", 5).get(db);
    const orRows = await Project.query()
        .whereEq("name", "OpenOnly")
        .orWhereRelation("tasks", "status", "done")
        .get(db);
    const firstHit = await Project.query(db).firstWhere("slug", "sw-has-done");
    const firstMiss = await Project.query(db).firstWhere("slug", "nope");
    const firstByOperator = await Task.query(db).firstWhere("priority", ">", 5);

    return ok(c, {
        feature: "whereRelation() / orWhereRelation() / firstWhere()",
        whatItShows: FEATURES[1]!.whatItShows,
        snippet:
            'await Project.query().whereRelation("tasks", "status", "done").get(db);\n' +
            'await Project.query().whereRelation("tasks", "priority", ">", 5).get(db);\n' +
            'await Project.query().whereEq("name", "OpenOnly").orWhereRelation("tasks", "status", "done").get(db);\n' +
            'await Project.query(db).firstWhere("slug", "sw-has-done");',
        result: {
            projectsWithADoneTask: hasDone.map((r) => r.get("id")),
            projectsWithAHighPriorityTask: highPriority.map((r) => r.get("id")),
            openOnlyOrHasDone: orRows.map((r) => r.get("id")).sort(),
            firstBySlugHit: firstHit?.get("id") ?? null,
            firstBySlugMiss: firstMiss,
            firstTaskByPriorityOperator: firstByOperator?.get("id") ?? null,
        },
    });
});

// ── 3. replicate() + wasRecentlyCreated ─────────────────────────────────────
featureRoutes.get("/replicate", async (c) => {
    const db = c.env.DB;
    await resetShowcase(db);
    await Project.create(db, { id: "sw_pr1", workspace_id: SW.ws, name: "Alpha", slug: "sw-alpha" });

    const fresh = await Task.create(db, { id: "sw_r1", project_id: "sw_pr1", title: "Fresh" });
    const freshFlag = fresh.wasRecentlyCreated; // true
    const loaded = await Task.find(db, "sw_r1");
    const loadedFlag = loaded!.wasRecentlyCreated; // false

    const orig = await Task.create(db, { id: "sw_r2", project_id: "sw_pr1", title: "Twin", priority: 3 });
    const clone = orig.replicate();
    const cloneKeyBeforeSave = clone.getKey(); // null - PK stripped
    const clonePersisted = clone._persisted; // false
    const cloneDirty = clone.isDirty(); // true
    const savedClone = await clone.save(db);
    const twinCount = await Task.query().whereEq("title", "Twin").count(db); // 2

    // A soft-deleted original's deleted_at is stripped → the clone is un-trashed.
    const trashed = await Task.create(db, { id: "sw_r3", project_id: "sw_pr1", title: "Trashy" });
    await trashed.delete(db); // soft delete
    const untrashedClone = trashed.replicate();

    return ok(c, {
        feature: "replicate() + wasRecentlyCreated",
        whatItShows: FEATURES[2]!.whatItShows,
        snippet:
            "const clone = original.replicate(); // PK + deleted_at stripped, attrs dirty\n" +
            "const saved = await clone.save(db); // persists as a NEW row\n" +
            "saved.wasRecentlyCreated; // true - false once re-loaded",
        result: {
            freshWasRecentlyCreated: freshFlag,
            loadedWasRecentlyCreated: loadedFlag,
            cloneKeyBeforeSave,
            clonePersistedBeforeSave: clonePersisted,
            cloneDirtyBeforeSave: cloneDirty,
            savedCloneKey: savedClone.getKey<string>(),
            savedCloneIsNewRow: savedClone.getKey() !== orig.getKey(),
            savedCloneWasRecentlyCreated: savedClone.wasRecentlyCreated,
            twinCountAfterClone: twinCount,
            softDeletedOriginalTrashed: trashed.trashed(),
            untrashedCloneDeletedAt: untrashedClone.get("deleted_at") ?? null,
            untrashedCloneTrashed: untrashedClone.trashed(),
        },
    });
});

// ── 4. constrained eager loading - .with({ rel: q => q… }) ──────────────────
featureRoutes.get("/constrained-eager", async (c) => {
    const db = c.env.DB;
    await resetShowcase(db);
    await Project.create(db, { id: "sw_pr1", workspace_id: SW.ws, name: "Alpha", slug: "sw-alpha" });
    await Task.create(db, { id: "sw_e1", project_id: "sw_pr1", title: "done-1", status: "done" });
    await Task.create(db, { id: "sw_e2", project_id: "sw_pr1", title: "open-1", status: "open" });
    await Task.create(db, { id: "sw_e3", project_id: "sw_pr1", title: "done-2", status: "done" });

    const filtered = await Project.query()
        .with({ tasks: (q) => q.where("status", "=", "done") })
        .whereEq("id", "sw_pr1")
        .get(db);
    const ordered = await Project.query()
        .with({ tasks: (q) => q.orderBy("title", "asc") })
        .whereEq("id", "sw_pr1")
        .get(db);
    const unconstrained = await Project.query().with({ tasks: true }).whereEq("id", "sw_pr1").get(db);

    return ok(c, {
        feature: "constrained eager loading - .with({ rel: q => q… })",
        whatItShows: FEATURES[3]!.whatItShows,
        snippet:
            'await Project.query()\n' +
            '  .with({ tasks: (q) => q.where("status", "=", "done") })\n' +
            '  .whereEq("id", projectId)\n' +
            '  .get(db); // relations.tasks holds only the "done" rows',
        result: {
            doneOnlyTaskIds: idsOf(filtered[0]!.relations.tasks as Task[]),
            orderedTaskTitles: (ordered[0]!.relations.tasks as Task[]).map((t) => t.get("title")),
            unconstrainedTaskCount: (unconstrained[0]!.relations.tasks as Task[]).length,
        },
    });
});

// ── 5. enumCast() (+ onInvalidRead) ─────────────────────────────────────────
featureRoutes.get("/enum-cast", async (c) => {
    const db = c.env.DB;
    await ShowcaseDoc.query().delete(db); // clear the isolated table

    const created = await ShowcaseDoc.create(db, { id: "d1", status: "published", level: 2 });
    const roundTrip = await ShowcaseDoc.find(db, "d1");

    // An out-of-set write throws - surfaced here as a captured message, in a real
    // route you'd map it to a 400 in the error envelope.
    let invalidWriteRejected: string | null = null;
    try {
        await ShowcaseDoc.create(db, { id: "bad", status: "spam" as ShowcaseDocStatus });
    } catch (e) {
        invalidWriteRejected = (e as Error).message;
    }

    // onInvalidRead: plant a legacy/out-of-set value with the uncast model, then read
    // it back two ways - strict (throws) vs the opt-in lenient model (returns null).
    await ShowcaseDocRaw.create(db, { id: "legacy", status: "legacy_v1", level: 1 });
    let strictReadThrew = false;
    try {
        await ShowcaseDoc.find(db, "legacy");
    } catch {
        strictReadThrew = true;
    }
    const lenient = await ShowcaseDocLenient.find(db, "legacy");

    return ok(c, {
        feature: "enumCast() (+ onInvalidRead)",
        whatItShows: FEATURES[4]!.whatItShows,
        snippet:
            'static casts = {\n' +
            '  status: enumCast(["draft", "published", "archived"]),                    // throws on a bad value\n' +
            '  legacyStatus: enumCast([...], { onInvalidRead: "null" }),                // reads a bad value back as null\n' +
            '} as const;',
        result: {
            roundTrip: { status: roundTrip!.get("status"), level: roundTrip!.get("level") },
            createdIsValid: created.get("status") === "published",
            invalidWriteRejected,
            strictReadThrew,
            lenientReadReturnedNull: lenient!.get("status") === null,
        },
    });
});

// ── 6. withMin() / withMax() / withExists() ─────────────────────────────────
featureRoutes.get("/relation-aggregates", async (c) => {
    const db = c.env.DB;
    await resetShowcase(db);
    await Project.create(db, { id: "sw_pr1", workspace_id: SW.ws, name: "Alpha", slug: "sw-alpha" });
    await Project.create(db, { id: "sw_pr2", workspace_id: SW.ws, name: "Bare", slug: "sw-bare" });
    await Task.create(db, { id: "sw_a1", project_id: "sw_pr1", title: "lo", priority: 1 });
    await Task.create(db, { id: "sw_a2", project_id: "sw_pr1", title: "hi", priority: 8 });
    await Task.create(db, { id: "sw_a3", project_id: "sw_pr1", title: "mid", priority: 5 });
    // sw_pr2 deliberately has no tasks.

    const projects = await Project.query()
        .withMin("tasks", "priority")
        .withMax("tasks", "priority")
        .withExists("tasks")
        .orderBy("id")
        .get(db);
    const alpha = projects.find((p) => p.get("id") === "sw_pr1")!;
    const bare = projects.find((p) => p.get("id") === "sw_pr2")!;

    const aliased = await Project.query().withMax("tasks", "priority", "top").whereEq("id", "sw_pr1").get(db);

    return ok(c, {
        feature: "withMin() / withMax() / withExists()",
        whatItShows: FEATURES[5]!.whatItShows,
        snippet:
            'await Project.query()\n' +
            '  .withMin("tasks", "priority")\n' +
            '  .withMax("tasks", "priority", "top") // custom alias\n' +
            '  .withExists("tasks")                 // concrete 0/1, never null\n' +
            '  .get(db);',
        result: {
            alpha: {
                tasksPriorityMin: num(attr(alpha, "tasks_priority_min")),
                tasksPriorityMax: num(attr(alpha, "tasks_priority_max")),
                tasksExists: num(attr(alpha, "tasks_exists")),
            },
            bare: {
                tasksPriorityMin: num(attr(bare, "tasks_priority_min")),
                tasksPriorityMax: num(attr(bare, "tasks_priority_max")),
                tasksExists: num(attr(bare, "tasks_exists")),
            },
            customAliasTop: num(attr(aliased[0]!, "top")),
        },
    });
});

// ── 7. intersect() / except() (soft-delete scoped) ──────────────────────────
featureRoutes.get("/set-operators", async (c) => {
    const db = c.env.DB;
    await resetShowcase(db);
    const base = { workspace_id: SW.ws, author_id: SW.user, body: "b" };
    await Post.create(db, { ...base, id: "sw_p1", slug: "sw-p1", title: "a", status: "published", view_count: 100 });
    await Post.create(db, { ...base, id: "sw_p2", slug: "sw-p2", title: "b", status: "published", view_count: 5 });
    await Post.create(db, { ...base, id: "sw_p3", slug: "sw-p3", title: "c", status: "archived", view_count: 100 });
    // sw_p4 matches BOTH predicates but is soft-deleted → must never appear.
    await Post.create(db, { ...base, id: "sw_p4", slug: "sw-p4", title: "d", status: "published", view_count: 100 });
    await (await Post.find(db, "sw_p4"))!.delete(db);

    const intersect = await Post.query()
        .whereEq("status", "published")
        .intersect(Post.query().whereEq("view_count", 100))
        .get(db);
    const except = await Post.query()
        .whereEq("status", "published")
        .except(Post.query().whereEq("view_count", 100))
        .get(db);

    const intersectIds = intersect.map((r) => r.get("id"));
    const exceptIds = except.map((r) => r.get("id"));

    return ok(c, {
        feature: "intersect() / except()",
        whatItShows: FEATURES[6]!.whatItShows,
        snippet:
            'await Post.query().whereEq("status", "published")\n' +
            '  .intersect(Post.query().whereEq("view_count", 100))\n' +
            '  .get(db); // soft-delete scope applied to BOTH operands',
        result: {
            intersectIds,
            exceptIds,
            trashedPostExcludedFromBoth: !intersectIds.includes("sw_p4") && !exceptIds.includes("sw_p4"),
        },
    });
});

// ── 8. date-part where helpers ──────────────────────────────────────────────
featureRoutes.get("/date-parts", async (c) => {
    const db = c.env.DB;
    await resetShowcase(db);
    const base = { workspace_id: SW.ws, author_id: SW.user, body: "b", status: "published" as const };
    await Post.create(db, { ...base, id: "sw_d1", slug: "sw-d1", title: "t1", published_at: "2026-01-15 09:30:00" });
    await Post.create(db, { ...base, id: "sw_d2", slug: "sw-d2", title: "t2", published_at: "2026-01-20 14:00:00" });
    await Post.create(db, { ...base, id: "sw_d3", slug: "sw-d3", title: "t3", published_at: "2025-03-05 09:30:00" });

    const byDate = await Post.query().whereDate("published_at", "2026-01-15").get(db);
    const byMonth = await Post.query().whereMonth("published_at", 1).get(db);
    const byYear = await Post.query().whereYear("published_at", 2026).get(db);
    const byDay = await Post.query().whereDay("published_at", 15).get(db);
    const byTime = await Post.query().whereTime("published_at", "09:30:00").get(db);
    const byTimeOperator = await Post.query().whereTime("published_at", ">=", "10:00:00").get(db);

    return ok(c, {
        feature: "whereDate / whereTime / whereYear / whereMonth / whereDay",
        whatItShows: FEATURES[7]!.whatItShows,
        snippet:
            'await Post.query().whereDate("published_at", "2026-01-15").get(db);\n' +
            'await Post.query().whereMonth("published_at", 1).get(db);\n' +
            'await Post.query().whereTime("published_at", ">=", "10:00:00").get(db);',
        result: {
            whereDate_2026_01_15: idsOf(byDate),
            whereMonth_1: idsOf(byMonth),
            whereYear_2026: idsOf(byYear),
            whereDay_15: idsOf(byDay),
            whereTime_0930: idsOf(byTime),
            whereTime_gte_1000: idsOf(byTimeOperator),
        },
    });
});

// ── 9. global scopes + withoutGlobalScope(s) ────────────────────────────────
featureRoutes.get("/global-scopes", async (c) => {
    const db = c.env.DB;
    setShowcaseTenant("t1");
    await ShowcaseTenantDoc.query().withoutGlobalScopes().delete(db); // clear regardless of tenant
    await ShowcaseTenantDoc.create(db, { id: "d1", tenant: "t1", title: "A" });
    await ShowcaseTenantDoc.create(db, { id: "d2", tenant: "t1", title: "B" });
    await ShowcaseTenantDoc.create(db, { id: "d3", tenant: "t2", title: "A" });

    const tenant1 = idsOf(await ShowcaseTenantDoc.query().get(db)); // d1, d2
    setShowcaseTenant("t2");
    const tenant2 = idsOf(await ShowcaseTenantDoc.query().get(db)); // d3
    setShowcaseTenant("t1");
    const composed = idsOf(await ShowcaseTenantDoc.query().whereEq("title", "A").get(db)); // d1 (not d3)
    const withoutOne = idsOf(await ShowcaseTenantDoc.query().withoutGlobalScope("tenant").get(db)); // all
    const withoutAll = idsOf(await ShowcaseTenantDoc.query().withoutGlobalScopes().get(db)); // all
    const scopedCount = await ShowcaseTenantDoc.query().count(db); // 2
    const rawCount = await ShowcaseTenantDoc.query().withoutGlobalScopes().count(db); // 3

    return ok(c, {
        feature: "global scopes + withoutGlobalScope(s)",
        whatItShows: FEATURES[8]!.whatItShows,
        snippet:
            'static globalScopes = {\n' +
            '  tenant: (q) => q.whereEq("tenant", currentTenant),\n' +
            '};\n' +
            'await ShowcaseTenantDoc.query().get(db);                       // auto-scoped to current tenant\n' +
            'await ShowcaseTenantDoc.query().withoutGlobalScope("tenant").get(db); // opt out',
        result: {
            tenant1Docs: tenant1,
            tenant2Docs: tenant2,
            composedWithWhereTitleA: composed,
            withoutGlobalScopeTenant: withoutOne,
            withoutGlobalScopes: withoutAll,
            scopedCount,
            rawCount,
        },
    });
});

// ── 10. hasManyThrough / hasOneThrough ──────────────────────────────────────
featureRoutes.get("/through-relations", async (c) => {
    const db = c.env.DB;
    for (const m of [ShowcaseArticle, ShowcaseCitizen, ShowcaseCountry]) {
        await m.query().delete(db);
    }
    await ShowcaseCountry.create(db, { id: "c1", name: "US" });
    await ShowcaseCountry.create(db, { id: "c2", name: "UK" });
    await ShowcaseCountry.create(db, { id: "c3", name: "Empty" });
    await ShowcaseCitizen.create(db, { id: "u1", country_id: "c1", name: "a" });
    await ShowcaseCitizen.create(db, { id: "u2", country_id: "c1", name: "b" });
    await ShowcaseCitizen.create(db, { id: "u3", country_id: "c2", name: "c" });
    await ShowcaseArticle.create(db, { id: "p1", citizen_id: "u1", title: "P1" });
    await ShowcaseArticle.create(db, { id: "p2", citizen_id: "u1", title: "P2" });
    await ShowcaseArticle.create(db, { id: "p3", citizen_id: "u2", title: "P3" });
    await ShowcaseArticle.create(db, { id: "p4", citizen_id: "u3", title: "P4" });

    const eager = await ShowcaseCountry.query().with(["articles"]).orderBy("id").get(db);
    const c1 = eager.find((c) => c.get("id") === "c1")!;
    const c2 = eager.find((c) => c.get("id") === "c2")!;

    const lazyCountry = await ShowcaseCountry.find(db, "c1");
    const lazyArticles = (await lazyCountry!.related("articles").get(db)) as ShowcaseArticle[];

    const constrained = await ShowcaseCountry.query()
        .with({ articles: (q) => q.where("title", "=", "P1") })
        .whereEq("id", "c1")
        .get(db);

    const withOne = await ShowcaseCountry.query().with(["latestArticle"]).orderBy("id").get(db);
    const one1 = withOne.find((c) => c.get("id") === "c1")!;
    const oneEmpty = withOne.find((c) => c.get("id") === "c3")!;

    return ok(c, {
        feature: "hasManyThrough / hasOneThrough",
        whatItShows: FEATURES[9]!.whatItShows,
        snippet:
            'articles: {\n' +
            '  type: "hasManyThrough", model: () => Article, through: () => Citizen,\n' +
            '  firstKey: "country_id", secondKey: "citizen_id",\n' +
            '};\n' +
            'await Country.query().with(["articles"]).get(db);',
        result: {
            eagerC1Articles: idsOf(c1.relations.articles as ShowcaseArticle[]),
            eagerC2Articles: idsOf(c2.relations.articles as ShowcaseArticle[]),
            lazyC1Articles: idsOf(lazyArticles),
            constrainedC1Articles: idsOf(constrained[0]!.relations.articles as ShowcaseArticle[]),
            hasOneThroughC1: (one1.relations.latestArticle as ShowcaseArticle | null)?.get("id") ?? null,
            hasOneThroughEmptyCountry: (oneEmpty.relations.latestArticle as ShowcaseArticle | null) ?? null,
        },
    });
});

// ── 11. prepare() + placeholder() ───────────────────────────────────────────
featureRoutes.get("/prepared-queries", async (c) => {
    const db = c.env.DB;
    const ids = ["sw_pu1", "sw_pu2", "sw_pu3"];
    for (const id of ids) await User.query().whereEq("id", id).withTrashed().delete(db);
    await User.create(db, { id: "sw_pu1", email: "pa@showcase.dev", name: "A", is_admin: true });
    await User.create(db, { id: "sw_pu2", email: "pb@showcase.dev", name: "B", is_admin: false });
    await User.create(db, { id: "sw_pu3", email: "pc@showcase.dev", name: "C", is_admin: true });

    // Compile once, reuse with different params.
    const byEmail = User.query().whereEq("email", placeholder("email")).prepare(db);
    const hitA = (await byEmail.first({ email: "pa@showcase.dev" }))?.get("id") ?? null;
    const hitB = (await byEmail.first({ email: "pb@showcase.dev" }))?.get("id") ?? null;
    const missing = await byEmail.first({ email: "missing@showcase.dev" });

    // Mix a static value with a placeholder.
    const adminByEmail = User.query()
        .whereEq("is_admin", true) // static (cast to 1)
        .where("email", "=", placeholder("email")) // placeholder
        .prepare(db);
    const adminHit = (await adminByEmail.first({ email: "pa@showcase.dev" }))?.get("id") ?? null;
    const notAdmin = await adminByEmail.first({ email: "pb@showcase.dev" });

    // get() hydrates multiple rows and carries the soft-delete scope.
    await (await User.find(db, "sw_pu3"))!.delete(db); // trash pu3 → excluded
    const adminsStmt = User.query()
        .whereIn("id", ids) // scope to the showcase users only
        .whereEq("is_admin", placeholder("flag"))
        .orderBy("id")
        .prepare(db);
    const adminRows = await adminsStmt.get({ flag: 1 }); // placeholders bind RAW → pass 1

    // A missing placeholder value throws.
    let missingPlaceholderThrew = false;
    try {
        await User.query().whereEq("email", placeholder("email")).prepare(db).first({});
    } catch {
        missingPlaceholderThrew = true;
    }

    return ok(c, {
        feature: "prepare() + placeholder()",
        whatItShows: FEATURES[10]!.whatItShows,
        snippet:
            'const byEmail = User.query().whereEq("email", placeholder("email")).prepare(db);\n' +
            'await byEmail.first({ email: "pa@showcase.dev" }); // compiled once, reused\n' +
            'await byEmail.first({ email: "pb@showcase.dev" });',
        result: {
            reusedFirstHitA: hitA,
            reusedFirstHitB: hitB,
            reusedFirstMiss: missing,
            adminMixedStaticAndPlaceholder: adminHit,
            nonAdminReturnsNull: notAdmin,
            adminRowsExcludingTrashed: adminRows.map((r) => r.get("id")),
            firstAdminStillHydrated: adminRows[0]?.get("is_admin") ?? null,
            missingPlaceholderThrew,
        },
    });
});

// ── 13. transaction() - atomic unit-of-work ─────────────────────────────────
featureRoutes.get("/transactions", async (c) => {
    const db = c.env.DB;
    await resetShowcase(db);
    for (const id of ["sw_au", "sw_ok", "sw_before"]) {
        await User.query().whereEq("id", id).withTrashed().delete(db);
    }

    // Atomic parent + child across tables.
    await transaction(db, async (tx) => {
        await tx.create(User, { id: "sw_au", email: "author@showcase.dev", name: "Author" });
        await tx.create(Post, {
            id: "sw_ap", workspace_id: SW.ws, author_id: "sw_au",
            slug: "sw-atomic", title: "Atomic", body: "b", status: "draft",
        });
    });
    const atomicUser = await User.query().whereEq("id", "sw_au").count(db);
    const atomicPost = await Post.query().whereEq("id", "sw_ap").count(db);

    // Roll EVERYTHING back on a constraint violation (email is NOT NULL).
    let rolledBack = false;
    try {
        await transaction(db, async (tx) => {
            await tx.create(User, { id: "sw_ok", email: "ok@showcase.dev", name: "Ok" });
            await tx.create(User, { id: "sw_bad", name: "Bad" } as never); // fails the batch
        });
    } catch {
        rolledBack = true;
    }
    const okDiscarded = (await User.query().whereEq("id", "sw_ok").count(db)) === 0;

    // A before-hook returning false aborts the whole tx (TransactionAborted).
    let abortedWithTransactionAborted = false;
    try {
        await transaction(db, async (tx) => {
            await tx.create(User, { id: "sw_before", email: "before@showcase.dev", name: "Before" });
            await tx.create(GuardedShowcaseUser, { id: "sw_guard", email: "guard@showcase.dev", name: "Guard" });
        });
    } catch (e) {
        abortedWithTransactionAborted = e instanceof TransactionAborted;
    }
    const beforeDiscarded = (await User.query().whereEq("id", "sw_before").count(db)) === 0;

    return ok(c, {
        feature: "transaction() - atomic unit-of-work",
        whatItShows: FEATURES[12]!.whatItShows,
        snippet:
            "await transaction(db, async (tx) => {\n" +
            "  await tx.create(User, { id, email, name });\n" +
            "  await tx.create(Post, { id, workspace_id, author_id, ... });\n" +
            "}); // both commit, or neither does",
        result: {
            atomicUserCreated: atomicUser === 1,
            atomicPostCreated: atomicPost === 1,
            rolledBackOnConstraintViolation: rolledBack && okDiscarded,
            abortedWithTransactionAborted,
            beforeHookAbortDiscardedEarlierWrite: beforeDiscarded,
        },
    });
});

// ── 14. tx.increment() / tx.decrement() - atomic counters in a transaction ──
featureRoutes.get("/transaction-counters", async (c) => {
    const db = c.env.DB;
    await resetShowcase(db);
    await Post.create(db, {
        id: "sw_tx", workspace_id: SW.ws, author_id: SW.user, slug: "sw-tx",
        title: "Counter", body: "b", status: "published", view_count: 0,
    });

    // Atomic bump + audit insert commit together.
    await transaction(db, async (tx) => {
        tx.increment(Post.query().whereEq("id", "sw_tx"), "view_count", 3);
        await tx.create(ActivityEvent, {
            id: "sw_ev1", workspace_id: SW.ws, actor_id: null,
            verb: "post.viewed", subject_type: "post", subject_id: "sw_tx", payload: {},
        });
    });
    const afterCommit = (await Post.find(db, "sw_tx"))!.get("view_count"); // 3
    const auditRow = await ActivityEvent.query().whereEq("id", "sw_ev1").count(db); // 1

    // decrement + default-amount increment net to zero in one tx.
    await transaction(db, async (tx) => {
        tx.decrement(Post.query().whereEq("id", "sw_tx"), "view_count", 1); // -1
        tx.increment(Post.query().whereEq("id", "sw_tx"), "view_count"); // +1 (default)
    });
    const afterNetZero = (await Post.find(db, "sw_tx"))!.get("view_count"); // still 3

    // A later failure rolls the bump back (duplicate PK on the audit insert).
    let rolledBack = false;
    try {
        await transaction(db, async (tx) => {
            tx.increment(Post.query().whereEq("id", "sw_tx"), "view_count", 100);
            await tx.create(ActivityEvent, {
                id: "sw_ev1", workspace_id: SW.ws, actor_id: null,
                verb: "post.viewed", subject_type: "post", subject_id: "sw_tx", payload: {},
            });
        });
    } catch {
        rolledBack = true;
    }
    const afterRollback = (await Post.find(db, "sw_tx"))!.get("view_count"); // 3 unchanged

    return ok(c, {
        feature: "tx.increment() / tx.decrement()",
        whatItShows: FEATURES[13]!.whatItShows,
        snippet:
            "await transaction(db, async (tx) => {\n" +
            '  tx.increment(Post.query().whereEq("id", id), "view_count", 3);\n' +
            "  await tx.create(ActivityEvent, { ... }); // audit row\n" +
            "}); // counter bump + audit insert are atomic",
        result: {
            viewCountAfterAtomicBump: afterCommit,
            auditRowCommitted: auditRow === 1,
            viewCountAfterNetZeroTx: afterNetZero,
            rolledBackOnLaterFailure: rolledBack,
            viewCountUnchangedAfterRollback: afterRollback,
        },
    });
});
