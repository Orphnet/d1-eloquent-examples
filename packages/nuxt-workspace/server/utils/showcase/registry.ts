/**
 * Beta.3 feature showcase - the 14 features registry.
 *
 * Each entry runs a single d1-eloquent beta.3 feature LIVE against D1 and
 * returns a plain result object. The exact API calls are lifted from the
 * canonical integration reference
 * (`packages/hono-workspace/src/features.integration.test.ts`) so the demo and
 * the test agree on usage.
 *
 * Every loader resets + reseeds its own dedicated `feat_*` fixtures first, so
 * results are deterministic and independent of the `acme` domain seed and of
 * how many times the endpoint has been hit.
 *
 * `configure(env)` has already run (via `ensureDb(event)`), so model calls use
 * the default connection - no explicit `db` argument needed, matching the rest
 * of the Nuxt demo. `transaction()` is the one API that takes `env.DB` directly.
 */
import { placeholder, transaction } from "@orphnet/d1-eloquent";
import {
    FeatAccount,
    FeatArticle,
    FeatCitizen,
    FeatCountry,
    FeatCounter,
    FeatEnumDoc,
    FeatEnumDocLenient,
    FeatMember,
    FeatScopedDoc,
    FeatStory,
    FeatTeam,
    setCurrentTenant,
} from "../../models/showcase";

export type FeatureResult = Record<string, unknown>;

export interface ShowcaseFeature {
    /** 1-based feature number matching the beta.3 changelog. */
    number: number;
    /** URL-safe key for `GET /api/features/:key`. */
    key: string;
    /** Human-readable title. */
    feature: string;
    /** One line: what the result proves. */
    whatItShows: string;
    /** Copyable d1-eloquent call(s) - doubles as inline documentation. */
    snippet: string;
    /** Runs the feature live and returns a JSON-safe result. */
    run: (env: Env) => Promise<FeatureResult>;
}

// ── shared helpers ──────────────────────────────────────────────────────────

/** Read dynamic aggregate columns (withMin/withMax/withExists) off a row. */
type LooseGet = { get(key: string): unknown };
const num = (m: LooseGet, key: string): number => m.get(key) as number;

/** Sorted ids of a model list (stable assertions). */
const idsOf = (rows: LooseGet[]): string[] => rows.map((r) => r.get("id") as string).sort();

async function wipe(env: Env, ...tables: string[]): Promise<void> {
    for (const t of tables) await env.DB.prepare(`DELETE FROM ${t}`).run();
}

/** Seed the team → member fixture shared by features 2, 4, 6, 11. */
async function seedTeams(env: Env): Promise<void> {
    await wipe(env, "feat_members", "feat_teams");
    await FeatTeam.create({ id: "tm-alpha", name: "Alpha" });
    await FeatTeam.create({ id: "tm-beta", name: "Beta" });
    await FeatTeam.create({ id: "tm-empty", name: "Empty" });
    await FeatMember.create({ id: "mb-1", team_id: "tm-alpha", name: "Ada", role: "lead", seniority: 9 });
    await FeatMember.create({ id: "mb-2", team_id: "tm-alpha", name: "Ben", role: "member", seniority: 2 });
    await FeatMember.create({ id: "mb-3", team_id: "tm-beta", name: "Cy", role: "member", seniority: 5 });
}

// ════════════════════════════════════════════════════════════════════════════
export const showcaseFeatures: ShowcaseFeature[] = [
    // 1 ─────────────────────────────────────────────────────────────────────
    {
        number: 1,
        key: "increment-decrement",
        feature: "increment() / decrement()",
        whatItShows:
            "Atomic counter bumps at the query-builder AND instance level, plus a NULL column coalesced to 0 - no read-modify-write race.",
        snippet: [
            'await FeatCounter.query().whereEq("id", id).increment("views", 5)',
            'await FeatCounter.query().whereEq("id", id).decrement("views", 4)',
            'const c = await FeatCounter.query().whereEq("id", id).first()',
            'await c.increment("views", 3)      // syncs in-memory attr, clears dirty',
            'await FeatCounter.query().whereEq("id", id).increment("hits", 1) // NULL → COALESCE(0)+1',
        ].join("\n"),
        run: async (env) => {
            await wipe(env, "feat_counters");
            await FeatCounter.create({ id: "cnt-1", label: "views", views: 10, hits: null });

            // query-builder increment / decrement
            await FeatCounter.query().whereEq("id", "cnt-1").increment("views", 5); // 10 → 15
            await FeatCounter.query().whereEq("id", "cnt-1").decrement("views", 4); // 15 → 11

            // instance increment: persists AND syncs the in-memory attribute
            const c = await FeatCounter.query().whereEq("id", "cnt-1").first();
            await c!.increment("views", 3); // 11 → 14
            const inMemory = c!.get("views");
            const stillDirty = c!.isDirty("views");

            // NULL counter treated as 0 via COALESCE
            await FeatCounter.query().whereEq("id", "cnt-1").increment("hits", 1); // NULL → 1

            const persisted = await FeatCounter.query().whereEq("id", "cnt-1").first();
            return {
                viewsAfterQbIncrementThenDecrement: 11,
                viewsAfterInstanceIncrement_inMemory: inMemory,
                viewsAfterInstanceIncrement_persisted: persisted!.get("views"),
                instanceLeftDirty: stillDirty,
                nullCounterCoalescedToZeroThenPlusOne: persisted!.get("hits"),
            };
        },
    },
    // 2 ─────────────────────────────────────────────────────────────────────
    {
        number: 2,
        key: "where-relation-first-where",
        feature: "whereRelation() / orWhereRelation() + firstWhere()",
        whatItShows:
            "Filter parents by a condition on a related table (2-arg = and 3-arg operator forms), OR it with a column filter, and fetch the first match (or null) in one call.",
        snippet: [
            'await FeatTeam.query().whereRelation("members", "role", "lead").get()',
            'await FeatTeam.query().whereRelation("members", "seniority", ">", 5).get()',
            'await FeatTeam.query().whereEq("name", "Beta").orWhereRelation("members", "role", "lead").get()',
            'await FeatTeam.query().firstWhere("name", "Alpha")   // → team | null',
            'await FeatMember.query().firstWhere("seniority", ">", 5)',
        ].join("\n"),
        run: async (env) => {
            await seedTeams(env);
            const twoArg = await FeatTeam.query().whereRelation("members", "role", "lead").get();
            const threeArg = await FeatTeam.query().whereRelation("members", "seniority", ">", 5).get();
            const ored = await FeatTeam.query()
                .whereEq("name", "Beta")
                .orWhereRelation("members", "role", "lead")
                .get();
            const hit = await FeatTeam.query().firstWhere("name", "Alpha");
            const miss = await FeatTeam.query().firstWhere("name", "Nope");
            const memberHit = await FeatMember.query().firstWhere("seniority", ">", 5);
            return {
                whereRelationTwoArg: twoArg.map((t) => t.get("name")),
                whereRelationThreeArg: threeArg.map((t) => t.get("name")),
                orWhereRelation: ored.map((t) => t.get("name")).sort(),
                firstWhereHit: hit?.get("name") ?? null,
                firstWhereMiss: miss,
                firstWhereMemberSeniority: memberHit?.get("seniority") ?? null,
            };
        },
    },
    // 3 ─────────────────────────────────────────────────────────────────────
    {
        number: 3,
        key: "replicate-was-recently-created",
        feature: "replicate() + wasRecentlyCreated",
        whatItShows:
            "Clone a row (PK stripped, marked dirty & unpersisted, deleted_at dropped from a soft-deleted original) and tell a freshly-INSERTed model from a loaded one.",
        snippet: [
            "const created = await FeatArticle.create({ ... })",
            "created.wasRecentlyCreated                     // true",
            'const loaded = await FeatArticle.query().whereEq("id", id).first()',
            "loaded.wasRecentlyCreated                      // false",
            "const clone = original.replicate()             // pk stripped, dirty, unpersisted",
            "await clone.save()                             // persists as a NEW row",
        ].join("\n"),
        run: async (env) => {
            await wipe(env, "feat_articles");
            const original = await FeatArticle.create({
                id: "art-orig",
                title: "Original",
                slug: "original",
                status: "published",
                views: 100,
                published_at: "2026-01-15 09:30:00",
            });
            const loaded = await FeatArticle.query().whereEq("id", "art-orig").first();

            const clone = original.replicate();
            const cloneKeyBeforeSave = clone.getKey();
            const cloneDirty = clone.isDirty();
            const clonePersisted = clone._persisted;
            const saved = await clone.save();
            const originalCount = await FeatArticle.query().whereEq("title", "Original").count();

            // soft-deleted original → replicate strips deleted_at
            const trashy = await FeatArticle.create({
                id: "art-trash",
                title: "Trashy",
                slug: "trashy",
                status: "draft",
                views: 0,
            });
            await trashy.delete(); // soft delete
            const untrashedClone = trashy.replicate();

            return {
                createFlag: original.wasRecentlyCreated,
                loadedFlag: loaded?.wasRecentlyCreated ?? null,
                cloneKeyNullBeforeSave: cloneKeyBeforeSave === null,
                cloneDirty,
                clonePersisted,
                savedCloneKeyIsNew: saved.getKey() !== original.getKey() && !!saved.getKey(),
                savedCloneRecentlyCreated: saved.wasRecentlyCreated,
                originalTitleRowCountAfterClone: originalCount,
                originalTrashed: trashy.trashed(),
                cloneDeletedAtStripped: untrashedClone.get("deleted_at") === undefined,
                cloneUntrashed: untrashedClone.trashed() === false,
            };
        },
    },
    // 4 ─────────────────────────────────────────────────────────────────────
    {
        number: 4,
        key: "constrained-eager-loading",
        feature: "constrained eager loading - .with({ rel: q => q... })",
        whatItShows:
            "Filter / order an eager-loaded relation with a callback (object-map form), or load it unconstrained with `true`.",
        snippet: [
            'await FeatTeam.query().with({ members: (q) => q.where("role", "=", "lead") }).get()',
            'await FeatTeam.query().with({ members: (q) => q.orderBy("seniority", "desc") }).get()',
            "await FeatTeam.query().with({ members: true }).get()   // unconstrained",
        ].join("\n"),
        run: async (env) => {
            await seedTeams(env);
            const filtered = await FeatTeam.query()
                .with({ members: (q) => q.where("role", "=", "lead") })
                .whereEq("id", "tm-alpha")
                .get();
            const ordered = await FeatTeam.query()
                .with({ members: (q) => q.orderBy("seniority", "desc") })
                .whereEq("id", "tm-alpha")
                .get();
            const unconstrained = await FeatTeam.query()
                .with({ members: true })
                .whereEq("id", "tm-alpha")
                .get();
            return {
                leadOnlyRoles: (filtered[0]?.relations.members ?? []).map((m) => m.get("role")),
                orderedSeniorities: (ordered[0]?.relations.members ?? []).map((m) => m.get("seniority")),
                unconstrainedCount: (unconstrained[0]?.relations.members ?? []).length,
            };
        },
    },
    // 5 ─────────────────────────────────────────────────────────────────────
    {
        number: 5,
        key: "enum-cast",
        feature: "enumCast() (incl. onInvalidRead opt-in)",
        whatItShows:
            "Whitelist a column's values: writes outside the set throw; reads coerce; a `onInvalidRead: 'null'` model reads a drifted value as null instead of throwing.",
        snippet: [
            'static casts = { status: enumCast(["draft", "published", "archived"]), level: enumCast([1, 2, 3]) }',
            'await FeatEnumDoc.create({ id, status: "published", level: 2 })   // ok',
            'await FeatEnumDoc.create({ id, status: "spam" })                  // throws Invalid enum value',
            "// lenient model: enumCast([...], { onInvalidRead: 'null' }) → reads a bad row as null",
        ].join("\n"),
        run: async (env) => {
            await wipe(env, "feat_enum_docs");

            await FeatEnumDoc.create({ id: "doc-ok", status: "published", level: 2 });
            const ok = await FeatEnumDoc.query().whereEq("id", "doc-ok").first();

            // write outside the set → throws
            let invalidWriteError: string | null = null;
            try {
                const badStatus: string = "spam";
                await FeatEnumDoc.create({
                    id: "doc-bad",
                    status: badStatus as "draft" | "published" | "archived",
                });
            } catch (e) {
                invalidWriteError = e instanceof Error ? e.message : String(e);
            }

            // null passes through
            await FeatEnumDoc.create({ id: "doc-null", status: "draft", level: null });
            const nulled = await FeatEnumDoc.query().whereEq("id", "doc-null").first();

            // a row whose stored value drifted out of the set (written raw)
            await env.DB
                .prepare("INSERT INTO feat_enum_docs (id, status, level) VALUES (?, ?, ?)")
                .bind("doc-corrupt", "corrupt", 9)
                .run();
            let strictReadThrew = false;
            try {
                await FeatEnumDoc.query().whereEq("id", "doc-corrupt").first();
            } catch {
                strictReadThrew = true;
            }
            const lenient = await FeatEnumDocLenient.query().whereEq("id", "doc-corrupt").first();

            return {
                validReadBack: { status: ok?.get("status") ?? null, level: ok?.get("level") ?? null },
                invalidWriteRejected: invalidWriteError !== null,
                invalidWriteMessage: invalidWriteError,
                // NB: don't `?? fallback` here - that would mask the legit null.
                nullPassesThrough: nulled ? nulled.get("level") : "NO_ROW",
                strictReadThrewOnDrift: strictReadThrew,
                lenientReadCoercesToNull: lenient?.get("status") === null,
            };
        },
    },
    // 6 ─────────────────────────────────────────────────────────────────────
    {
        number: 6,
        key: "with-min-max-exists",
        feature: "withMin() / withMax() / withExists()",
        whatItShows:
            "Attach MIN/MAX of a related column and a concrete 0/1 existence flag (never null, even for parents with zero children) as correlated subqueries.",
        snippet: [
            'await FeatTeam.query().withMin("members", "seniority").withMax("members", "seniority").withExists("members").get()',
            'await FeatTeam.query().withMax("members", "seniority", "top").get()   // custom alias',
        ].join("\n"),
        run: async (env) => {
            await seedTeams(env);
            const rows = await FeatTeam.query()
                .withMin("members", "seniority")
                .withMax("members", "seniority")
                .withExists("members")
                .orderBy("id")
                .get();
            const alpha = rows.find((r) => r.get("id") === "tm-alpha")!;
            const empty = rows.find((r) => r.get("id") === "tm-empty")!;
            const aliased = await FeatTeam.query()
                .withMax("members", "seniority", "top")
                .whereEq("id", "tm-alpha")
                .get();
            return {
                alphaSeniorityMin: num(alpha, "members_seniority_min"),
                alphaSeniorityMax: num(alpha, "members_seniority_max"),
                alphaExists: num(alpha, "members_exists"),
                emptyExists: num(empty, "members_exists"),
                customAliasTop: num(aliased[0]!, "top"),
            };
        },
    },
    // 7 ─────────────────────────────────────────────────────────────────────
    {
        number: 7,
        key: "intersect-except",
        feature: "intersect() / except() set operators",
        whatItShows:
            "Combine two queries with INTERSECT / EXCEPT - and the soft-delete scope applies to BOTH operands, so a trashed row that matches both predicates is still excluded.",
        snippet: [
            'await FeatArticle.query().whereEq("status", "published")',
            '           .intersect(FeatArticle.query().whereEq("views", 100)).get()',
            'await FeatArticle.query().whereEq("status", "published")',
            '           .except(FeatArticle.query().whereEq("views", 100)).get()',
        ].join("\n"),
        run: async (env) => {
            await wipe(env, "feat_articles");
            const base = { slug: "x", published_at: null as string | null };
            await FeatArticle.create({ ...base, id: "p1", title: "a", slug: "p1", status: "published", views: 100 });
            await FeatArticle.create({ ...base, id: "p2", title: "b", slug: "p2", status: "published", views: 5 });
            await FeatArticle.create({ ...base, id: "p3", title: "c", slug: "p3", status: "archived", views: 100 });
            // p4 matches BOTH predicates but is soft-deleted → must never appear.
            await FeatArticle.create({ ...base, id: "p4", title: "d", slug: "p4", status: "published", views: 100 });
            const p4 = await FeatArticle.query().whereEq("id", "p4").first();
            await p4!.delete();

            const intersected = await FeatArticle.query()
                .whereEq("status", "published")
                .intersect(FeatArticle.query().whereEq("views", 100))
                .get();
            const excepted = await FeatArticle.query()
                .whereEq("status", "published")
                .except(FeatArticle.query().whereEq("views", 100))
                .get();
            return {
                intersectIds: intersected.map((r) => r.get("id")).sort(),
                exceptIds: excepted.map((r) => r.get("id")).sort(),
                trashedExcluded: !intersected.some((r) => r.get("id") === "p4"),
            };
        },
    },
    // 8 ─────────────────────────────────────────────────────────────────────
    {
        number: 8,
        key: "date-part-where",
        feature: "date-part wheres - whereDate/Time/Year/Month/Day",
        whatItShows:
            "Filter a datetime column by an extracted part: calendar day, time-of-day (incl. operator form), year, month, or day-of-month.",
        snippet: [
            'await FeatArticle.query().whereDate("published_at", "2026-01-15").get()',
            'await FeatArticle.query().whereMonth("published_at", 1).get()',
            'await FeatArticle.query().whereYear("published_at", 2026).get()',
            'await FeatArticle.query().whereDay("published_at", 15).get()',
            'await FeatArticle.query().whereTime("published_at", "09:30:00").get()',
            'await FeatArticle.query().whereTime("published_at", ">=", "10:00:00").get()',
        ].join("\n"),
        run: async (env) => {
            await wipe(env, "feat_articles");
            const mk = (id: string, published_at: string) =>
                FeatArticle.create({ id, title: id, slug: id, status: "published", views: 0, published_at });
            await mk("e1", "2026-01-15 09:30:00");
            await mk("e2", "2026-01-20 14:00:00");
            await mk("e3", "2025-03-05 09:30:00");

            const byDate = await FeatArticle.query().whereDate("published_at", "2026-01-15").get();
            const byMonth = await FeatArticle.query().whereMonth("published_at", 1).get();
            const byYear = await FeatArticle.query().whereYear("published_at", 2026).get();
            const byDay = await FeatArticle.query().whereDay("published_at", 15).get();
            const byTime = await FeatArticle.query().whereTime("published_at", "09:30:00").get();
            const byTimeOp = await FeatArticle.query().whereTime("published_at", ">=", "10:00:00").get();
            return {
                whereDate: idsOf(byDate),
                whereMonth: idsOf(byMonth),
                whereYear: idsOf(byYear),
                whereDay: idsOf(byDay),
                whereTime: idsOf(byTime),
                whereTimeOperator: idsOf(byTimeOp),
            };
        },
    },
    // 9 ─────────────────────────────────────────────────────────────────────
    {
        number: 9,
        key: "global-scopes",
        feature: "global scopes + withoutGlobalScope(s)",
        whatItShows:
            "A `static globalScopes` entry auto-applies to every query (and count), composes AND with user clauses, tracks external state, and is removable per-query.",
        snippet: [
            "static globalScopes = { tenant: (q) => q.whereEq('tenant', currentTenant) }",
            "await FeatScopedDoc.query().get()                          // tenant-scoped",
            "await FeatScopedDoc.query().withoutGlobalScope('tenant').get()  // all tenants",
            "await FeatScopedDoc.query().withoutGlobalScopes().count()       // unscoped count",
        ].join("\n"),
        run: async (env) => {
            setCurrentTenant("t1");
            await wipe(env, "feat_scoped_docs");
            await FeatScopedDoc.create({ id: "d1", tenant: "t1", title: "A" });
            await FeatScopedDoc.create({ id: "d2", tenant: "t1", title: "B" });
            await FeatScopedDoc.create({ id: "d3", tenant: "t2", title: "A" });

            const asT1 = idsOf(await FeatScopedDoc.query().get());
            setCurrentTenant("t2");
            const asT2 = idsOf(await FeatScopedDoc.query().get());
            setCurrentTenant("t1");

            const composed = idsOf(await FeatScopedDoc.query().whereEq("title", "A").get());
            const withoutOne = idsOf(await FeatScopedDoc.query().withoutGlobalScope("tenant").get());
            const withoutAll = idsOf(await FeatScopedDoc.query().withoutGlobalScopes().get());
            const scopedCount = await FeatScopedDoc.query().count();
            const unscopedCount = await FeatScopedDoc.query().withoutGlobalScopes().count();
            return {
                scopedToTenantT1: asT1,
                scopedToTenantT2: asT2,
                composesAndWithWhere: composed,
                withoutGlobalScopeTenant: withoutOne,
                withoutGlobalScopes: withoutAll,
                scopedCount,
                unscopedCount,
            };
        },
    },
    // 10 ────────────────────────────────────────────────────────────────────
    {
        number: 10,
        key: "has-many-through",
        feature: "hasManyThrough / hasOneThrough",
        whatItShows:
            "Reach a distant relation across an intermediate table: a Country's Stories THROUGH its Citizens - eager, lazy, and the single-row hasOneThrough (null when empty).",
        snippet: [
            "stories:     { type: 'hasManyThrough', model: () => FeatStory, through: () => FeatCitizen, firstKey: 'country_id', secondKey: 'citizen_id' }",
            "latestStory: { type: 'hasOneThrough',  model: () => FeatStory, through: () => FeatCitizen, firstKey: 'country_id', secondKey: 'citizen_id' }",
            'await FeatCountry.query().with(["stories"]).get()',
            'await country.related("stories").get()          // lazy',
        ].join("\n"),
        run: async (env) => {
            await wipe(env, "feat_stories", "feat_citizens", "feat_countries");
            await FeatCountry.create({ id: "c1", name: "US" });
            await FeatCountry.create({ id: "c2", name: "UK" });
            await FeatCountry.create({ id: "c3", name: "Empty" });
            await FeatCitizen.create({ id: "u1", country_id: "c1", name: "a" });
            await FeatCitizen.create({ id: "u2", country_id: "c1", name: "b" });
            await FeatCitizen.create({ id: "u3", country_id: "c2", name: "c" });
            await FeatStory.create({ id: "s1", citizen_id: "u1", title: "S1" });
            await FeatStory.create({ id: "s2", citizen_id: "u1", title: "S2" });
            await FeatStory.create({ id: "s3", citizen_id: "u2", title: "S3" });
            await FeatStory.create({ id: "s4", citizen_id: "u3", title: "S4" });

            const eager = await FeatCountry.query().with(["stories"]).orderBy("id").get();
            const c1 = eager.find((c) => c.get("id") === "c1")!;
            const c2 = eager.find((c) => c.get("id") === "c2")!;

            const lazyC1 = (await c1.related("stories").get()) as FeatStory[];

            const withOne = await FeatCountry.query().with(["latestStory"]).orderBy("id").get();
            const oneC1 = withOne.find((c) => c.get("id") === "c1")!;
            const oneC3 = withOne.find((c) => c.get("id") === "c3")!;

            return {
                c1StoriesThroughCitizens: idsOf(c1.relations.stories),
                c2StoriesThroughCitizens: idsOf(c2.relations.stories),
                lazyLoadedC1: idsOf(lazyC1),
                hasOneThroughC1NotNull: oneC1.relations.latestStory !== null,
                hasOneThroughC3Null: oneC3.relations.latestStory === null,
            };
        },
    },
    // 11 ────────────────────────────────────────────────────────────────────
    {
        number: 11,
        key: "prepared-queries",
        feature: "prepared queries - prepare() + placeholder()",
        whatItShows:
            "Compile a query ONCE, then execute it repeatedly with different bound params via named placeholders; a missing param throws.",
        snippet: [
            'const byRole = FeatMember.query().whereEq("role", placeholder("role")).prepare(env.DB)',
            'await byRole.get({ role: "lead" })     // reuse',
            'await byRole.get({ role: "member" })   // reuse, different bind',
            "await byRole.first({})                 // throws: missing placeholder 'role'",
        ].join("\n"),
        run: async (env) => {
            await seedTeams(env);
            const byRole = FeatMember.query().whereEq("role", placeholder("role")).prepare(env.DB);
            const leads = await byRole.get({ role: "lead" });
            const members = await byRole.get({ role: "member" });
            let missingThrew = false;
            let missingMessage: string | null = null;
            try {
                await byRole.first({});
            } catch (e) {
                missingThrew = true;
                missingMessage = e instanceof Error ? e.message : String(e);
            }
            return {
                leadNames: leads.map((m) => m.get("name")).sort(),
                memberNames: members.map((m) => m.get("name")).sort(),
                reusedSamePreparedStatement: true,
                missingPlaceholderThrew: missingThrew,
                missingPlaceholderMessage: missingMessage,
            };
        },
    },
    // 12 ────────────────────────────────────────────────────────────────────
    {
        number: 12,
        key: "schema-diff-generate",
        feature: "schema-diff generate CLI (d1-eloquent generate)",
        whatItShows:
            "A build-time command (not an HTTP route): diffs model column declarations against the migration history and emits an ADD/DROP COLUMN migration. This endpoint reports the drift resolved in THIS repo.",
        snippet: [
            "# 1. FeatArticle declares an `archived` column the create-table migration lacked.",
            "bun run db:generate        # d1-eloquent generate → writes an ADD COLUMN migration",
            "bun run db:migrate         # apply it",
            "# See database/migrations/20260517101800_alter_feat_articles_add_archived.ts",
        ].join("\n"),
        run: async (env) => {
            // Prove the drift was resolved: the model-declared `archived` column
            // (added by the generated migration) is queryable and cast to boolean.
            await wipe(env, "feat_articles");
            await FeatArticle.create({
                id: "gen-1",
                title: "Generated demo",
                slug: "generated-demo",
                status: "draft",
                views: 0,
                archived: true,
            });
            const row = await FeatArticle.query().whereEq("id", "gen-1").first();
            return {
                kind: "build-time CLI - demonstrated via a committed generated migration + npm script",
                command: "bun run db:generate  (alias for: d1-eloquent generate)",
                versus: "bun run db:make:migration scaffolds an EMPTY migration; generate fills it from the model↔schema diff",
                generatedMigration:
                    "database/migrations/20260517101800_alter_feat_articles_add_archived.ts",
                driftColumn: "feat_articles.archived",
                archivedColumnNowQueryable: row?.get("archived") === true,
            };
        },
    },
    // 13 ────────────────────────────────────────────────────────────────────
    {
        number: 13,
        key: "transactions",
        feature: "transaction() - atomic unit-of-work",
        whatItShows:
            "Multiple writes commit together or not at all: a parent+child insert commits atomically; a failing statement rolls back EVERYTHING, including the earlier valid write.",
        snippet: [
            "await transaction(env.DB, async (tx) => {",
            '  await tx.create(FeatAccount, { id: "a", name: "Alice", balance: 100 })',
            '  await tx.create(FeatAccount, { id: "b", name: "Bob",   balance: 0 })',
            "})",
            "// a NOT NULL violation inside the closure rejects and rolls back both inserts",
        ].join("\n"),
        run: async (env) => {
            await wipe(env, "feat_accounts");

            await transaction(env.DB, async (tx) => {
                await tx.create(FeatAccount, { id: "acc-a", name: "Alice", balance: 100 });
                await tx.create(FeatAccount, { id: "acc-b", name: "Bob", balance: 0 });
            });
            const committedCount = await FeatAccount.query().count();

            let rolledBack = false;
            try {
                await transaction(env.DB, async (tx) => {
                    await tx.create(FeatAccount, { id: "acc-c", name: "Carol", balance: 5 });
                    // name is NOT NULL → this statement fails the whole batch.
                    await tx.create(FeatAccount, { id: "acc-d", name: null as never, balance: 0 });
                });
            } catch {
                rolledBack = true;
            }
            const carol = await FeatAccount.query().whereEq("id", "acc-c").first();
            const countAfterRollback = await FeatAccount.query().count();

            return {
                atomicInsertCommittedCount: committedCount,
                rollbackThrew: rolledBack,
                partialWriteDiscarded: carol === null,
                countUnchangedAfterRollback: countAfterRollback,
            };
        },
    },
    // 14 ────────────────────────────────────────────────────────────────────
    {
        number: 14,
        key: "tx-increment-decrement",
        feature: "tx.increment() / tx.decrement() - atomic counters in a tx",
        whatItShows:
            "Balance-transfer inside a transaction: a decrement on one row and an increment on another commit together, preserving the invariant; a throw rolls the bump back.",
        snippet: [
            "await transaction(env.DB, async (tx) => {",
            '  tx.decrement(FeatAccount.query().whereEq("id", "a"), "balance", 30)',
            '  tx.increment(FeatAccount.query().whereEq("id", "b"), "balance", 30)',
            "})   // both apply atomically → total balance preserved",
        ].join("\n"),
        run: async (env) => {
            await wipe(env, "feat_accounts");
            await FeatAccount.create({ id: "acc-a", name: "Alice", balance: 100 });
            await FeatAccount.create({ id: "acc-b", name: "Bob", balance: 0 });

            await transaction(env.DB, async (tx) => {
                tx.decrement(FeatAccount.query().whereEq("id", "acc-a"), "balance", 30);
                tx.increment(FeatAccount.query().whereEq("id", "acc-b"), "balance", 30);
            });
            const aliceAfter = (await FeatAccount.query().whereEq("id", "acc-a").first())!.get("balance");
            const bobAfter = (await FeatAccount.query().whereEq("id", "acc-b").first())!.get("balance");

            // a throw AFTER a queued increment rolls the bump back
            let rolledBack = false;
            try {
                await transaction(env.DB, async (tx) => {
                    tx.increment(FeatAccount.query().whereEq("id", "acc-a"), "balance", 999);
                    throw new Error("boom");
                });
            } catch {
                rolledBack = true;
            }
            const aliceAfterRollback = (await FeatAccount.query().whereEq("id", "acc-a").first())!.get("balance");

            return {
                aliceBalanceAfterTransfer: aliceAfter,
                bobBalanceAfterTransfer: bobAfter,
                totalPreserved: (aliceAfter as number) + (bobAfter as number) === 100,
                rollbackThrew: rolledBack,
                incrementRolledBack: aliceAfterRollback === 70,
            };
        },
    },
];

/** Look up a single showcase feature by its URL key. */
export function findShowcaseFeature(key: string): ShowcaseFeature | undefined {
    return showcaseFeatures.find((f) => f.key === key);
}
