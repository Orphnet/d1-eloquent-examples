/// <reference types="@cloudflare/vitest-pool-workers" />
// features-showcase.integration.test.ts
//
// Verifies the /api/features showcase route group: each endpoint runs its
// feature LIVE against the miniflare D1 (the app's own migrations build the
// tables via the shared setup hook) and returns a sane, deterministic result.
//
// Unlike features.integration.test.ts (which calls the ORM directly), this
// drives the real Hono app end-to-end through `app.fetch`, so it proves the
// endpoints are wired, reachable, and self-seeding.

import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "./index";

declare module "cloudflare:test" {
    interface ProvidedEnv {
        DB: D1Database;
    }
}

/** Fetch a showcase endpoint through the real app and return its `data`. */
async function call(path: string): Promise<Record<string, unknown>> {
    const res = await app.fetch(new Request(`https://example.test${path}`), env as unknown as Record<string, unknown>);
    const body = (await res.json()) as { ok: boolean; data?: unknown; error?: unknown };
    expect(res.status, `${path} → ${res.status} ${JSON.stringify(body)}`).toBe(200);
    expect(body.ok, JSON.stringify(body)).toBe(true);
    return body.data as Record<string, unknown>;
}

/** Fetch just the `result` payload of a feature endpoint. */
async function result(path: string): Promise<Record<string, unknown>> {
    const data = await call(path);
    expect(typeof data.feature).toBe("string");
    expect(typeof data.whatItShows).toBe("string");
    expect(typeof data.snippet).toBe("string");
    return data.result as Record<string, unknown>;
}

describe("GET /api/features (index)", () => {
    it("lists all 14 features", async () => {
        const data = await call("/api/features");
        expect(data.count).toBe(14);
        expect((data.features as unknown[]).length).toBe(14);
    });
});

describe("1. GET /api/features/counters", () => {
    it("increments/decrements at query + instance level with COALESCE hardening", async () => {
        const r = await result("/api/features/counters");
        expect(r.afterQueryBuilderIncrement).toBe(15);
        expect(r.afterQueryBuilderDecrement).toBe(11);
        expect(r.afterIncrementWithExtraColumns).toEqual({ viewCount: 13, title: "Touched" });
        expect(r.afterInstanceIncrement).toBe(16);
        expect(r.instanceStillDirty).toBe(false);
        expect(r.nullCounterCoalescedToZeroThenPlusFive).toBe(5);
    });
});

describe("2. GET /api/features/where-relation", () => {
    it("filters by related rows and fetches first-or-null", async () => {
        const r = await result("/api/features/where-relation");
        expect(r.projectsWithADoneTask).toEqual(["sw_pr1"]);
        expect(r.projectsWithAHighPriorityTask).toEqual(["sw_pr1"]);
        expect(r.openOnlyOrHasDone).toEqual(["sw_pr1", "sw_pr2"]);
        expect(r.firstBySlugHit).toBe("sw_pr1");
        expect(r.firstBySlugMiss).toBeNull();
        expect(r.firstTaskByPriorityOperator).toBe("sw_t1");
    });
});

describe("3. GET /api/features/replicate", () => {
    it("clones a row and reports wasRecentlyCreated", async () => {
        const r = await result("/api/features/replicate");
        expect(r.freshWasRecentlyCreated).toBe(true);
        expect(r.loadedWasRecentlyCreated).toBe(false);
        expect(r.cloneKeyBeforeSave).toBeNull();
        expect(r.clonePersistedBeforeSave).toBe(false);
        expect(r.cloneDirtyBeforeSave).toBe(true);
        expect(r.savedCloneKey).toBeTruthy();
        expect(r.savedCloneIsNewRow).toBe(true);
        expect(r.savedCloneWasRecentlyCreated).toBe(true);
        expect(r.twinCountAfterClone).toBe(2);
        expect(r.softDeletedOriginalTrashed).toBe(true);
        expect(r.untrashedCloneDeletedAt).toBeNull();
        expect(r.untrashedCloneTrashed).toBe(false);
    });
});

describe("4. GET /api/features/constrained-eager", () => {
    it("filters and orders an eager-loaded relation", async () => {
        const r = await result("/api/features/constrained-eager");
        expect(r.doneOnlyTaskIds).toEqual(["sw_e1", "sw_e3"]);
        expect(r.orderedTaskTitles).toEqual(["done-1", "done-2", "open-1"]);
        expect(r.unconstrainedTaskCount).toBe(3);
    });
});

describe("5. GET /api/features/enum-cast", () => {
    it("round-trips, rejects a bad write, and honours onInvalidRead", async () => {
        const r = await result("/api/features/enum-cast");
        expect(r.roundTrip).toEqual({ status: "published", level: 2 });
        expect(r.createdIsValid).toBe(true);
        expect(r.invalidWriteRejected).toMatch(/invalid enum value/i);
        expect(r.strictReadThrew).toBe(true);
        expect(r.lenientReadReturnedNull).toBe(true);
    });
});

describe("6. GET /api/features/relation-aggregates", () => {
    it("attaches min/max/exists incl. zero-row exists=0", async () => {
        const r = await result("/api/features/relation-aggregates");
        expect(r.alpha).toEqual({ tasksPriorityMin: 1, tasksPriorityMax: 8, tasksExists: 1 });
        expect(r.bare).toEqual({ tasksPriorityMin: null, tasksPriorityMax: null, tasksExists: 0 });
        expect(r.customAliasTop).toBe(8);
    });
});

describe("7. GET /api/features/set-operators", () => {
    it("intersect/except exclude the trashed row from both operands", async () => {
        const r = await result("/api/features/set-operators");
        expect(r.intersectIds).toEqual(["sw_p1"]);
        expect(r.exceptIds).toEqual(["sw_p2"]);
        expect(r.trashedPostExcludedFromBoth).toBe(true);
    });
});

describe("8. GET /api/features/date-parts", () => {
    it("filters by each date part", async () => {
        const r = await result("/api/features/date-parts");
        expect(r.whereDate_2026_01_15).toEqual(["sw_d1"]);
        expect(r.whereMonth_1).toEqual(["sw_d1", "sw_d2"]);
        expect(r.whereYear_2026).toEqual(["sw_d1", "sw_d2"]);
        expect(r.whereDay_15).toEqual(["sw_d1"]);
        expect(r.whereTime_0930).toEqual(["sw_d1", "sw_d3"]);
        expect(r.whereTime_gte_1000).toEqual(["sw_d2"]);
    });
});

describe("9. GET /api/features/global-scopes", () => {
    it("auto-applies the scope and opts out", async () => {
        const r = await result("/api/features/global-scopes");
        expect(r.tenant1Docs).toEqual(["d1", "d2"]);
        expect(r.tenant2Docs).toEqual(["d3"]);
        expect(r.composedWithWhereTitleA).toEqual(["d1"]);
        expect(r.withoutGlobalScopeTenant).toEqual(["d1", "d2", "d3"]);
        expect(r.withoutGlobalScopes).toEqual(["d1", "d2", "d3"]);
        expect(r.scopedCount).toBe(2);
        expect(r.rawCount).toBe(3);
    });
});

describe("10. GET /api/features/through-relations", () => {
    it("eager/lazy/constrained hasManyThrough + hasOneThrough", async () => {
        const r = await result("/api/features/through-relations");
        expect(r.eagerC1Articles).toEqual(["p1", "p2", "p3"]);
        expect(r.eagerC2Articles).toEqual(["p4"]);
        expect(r.lazyC1Articles).toEqual(["p1", "p2", "p3"]);
        expect(r.constrainedC1Articles).toEqual(["p1"]);
        expect(["p1", "p2", "p3"]).toContain(r.hasOneThroughC1);
        expect(r.hasOneThroughEmptyCountry).toBeNull();
    });
});

describe("11. GET /api/features/prepared-queries", () => {
    it("compiles once, reuses, carries soft-delete scope, throws on missing param", async () => {
        const r = await result("/api/features/prepared-queries");
        expect(r.reusedFirstHitA).toBe("sw_pu1");
        expect(r.reusedFirstHitB).toBe("sw_pu2");
        expect(r.reusedFirstMiss).toBeNull();
        expect(r.adminMixedStaticAndPlaceholder).toBe("sw_pu1");
        expect(r.nonAdminReturnsNull).toBeNull();
        expect(r.adminRowsExcludingTrashed).toEqual(["sw_pu1"]);
        expect(r.firstAdminStillHydrated).toBe(true);
        expect(r.missingPlaceholderThrew).toBe(true);
    });
});

describe("13. GET /api/features/transactions", () => {
    it("commits atomically, rolls back on violation, aborts on a false before-hook", async () => {
        const r = await result("/api/features/transactions");
        expect(r.atomicUserCreated).toBe(true);
        expect(r.atomicPostCreated).toBe(true);
        expect(r.rolledBackOnConstraintViolation).toBe(true);
        expect(r.abortedWithTransactionAborted).toBe(true);
        expect(r.beforeHookAbortDiscardedEarlierWrite).toBe(true);
    });
});

describe("14. GET /api/features/transaction-counters", () => {
    it("atomic counter bump + audit insert commit/roll back together", async () => {
        const r = await result("/api/features/transaction-counters");
        expect(r.viewCountAfterAtomicBump).toBe(3);
        expect(r.auditRowCommitted).toBe(true);
        expect(r.viewCountAfterNetZeroTx).toBe(3);
        expect(r.rolledBackOnLaterFailure).toBe(true);
        expect(r.viewCountUnchangedAfterRollback).toBe(3);
    });
});
