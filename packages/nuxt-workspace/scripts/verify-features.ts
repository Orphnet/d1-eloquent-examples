/**
 * Runtime verification for the beta.3 feature showcase.
 *
 * Binds the SAME local Miniflare D1 the Nitro routes use (via wrangler's
 * `getPlatformProxy`), runs every showcase loader from
 * `server/utils/showcase/registry.ts` - i.e. the exact code the
 * `/api/features` route executes - and asserts the precise expected result of
 * each of the 14 features. Exits non-zero on any mismatch.
 *
 *   bun run db:migrate          # ensure feat_* tables exist
 *   bun run features:verify     # this script
 *
 * This is the Nuxt demo's analogue of the Hono example's
 * `features.integration.test.ts` (the Nuxt package ships no vitest runner).
 */
import { getPlatformProxy } from "wrangler";
import { configure } from "@orphnet/d1-eloquent";
import { showcaseFeatures } from "../server/utils/showcase/registry.ts";

type Json = Record<string, unknown>;
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The exact, deterministic result each loader must produce (subset of keys). */
const EXPECTED: Record<string, Json> = {
    "increment-decrement": {
        viewsAfterQbIncrementThenDecrement: 11,
        viewsAfterInstanceIncrement_inMemory: 14,
        viewsAfterInstanceIncrement_persisted: 14,
        instanceLeftDirty: false,
        nullCounterCoalescedToZeroThenPlusOne: 1,
    },
    "where-relation-first-where": {
        whereRelationTwoArg: ["Alpha"],
        whereRelationThreeArg: ["Alpha"],
        orWhereRelation: ["Alpha", "Beta"],
        firstWhereHit: "Alpha",
        firstWhereMiss: null,
        firstWhereMemberSeniority: 9,
    },
    "replicate-was-recently-created": {
        createFlag: true,
        loadedFlag: false,
        cloneKeyNullBeforeSave: true,
        cloneDirty: true,
        clonePersisted: false,
        savedCloneKeyIsNew: true,
        savedCloneRecentlyCreated: true,
        originalTitleRowCountAfterClone: 2,
        originalTrashed: true,
        cloneDeletedAtStripped: true,
        cloneUntrashed: true,
    },
    "constrained-eager-loading": {
        leadOnlyRoles: ["lead"],
        orderedSeniorities: [9, 2],
        unconstrainedCount: 2,
    },
    "enum-cast": {
        validReadBack: { status: "published", level: 2 },
        invalidWriteRejected: true,
        nullPassesThrough: null,
        strictReadThrewOnDrift: true,
        lenientReadCoercesToNull: true,
    },
    "with-min-max-exists": {
        alphaSeniorityMin: 2,
        alphaSeniorityMax: 9,
        alphaExists: 1,
        emptyExists: 0,
        customAliasTop: 9,
    },
    "intersect-except": {
        intersectIds: ["p1"],
        exceptIds: ["p2"],
        trashedExcluded: true,
    },
    "date-part-where": {
        whereDate: ["e1"],
        whereMonth: ["e1", "e2"],
        whereYear: ["e1", "e2"],
        whereDay: ["e1"],
        whereTime: ["e1", "e3"],
        whereTimeOperator: ["e2"],
    },
    "global-scopes": {
        scopedToTenantT1: ["d1", "d2"],
        scopedToTenantT2: ["d3"],
        composesAndWithWhere: ["d1"],
        withoutGlobalScopeTenant: ["d1", "d2", "d3"],
        withoutGlobalScopes: ["d1", "d2", "d3"],
        scopedCount: 2,
        unscopedCount: 3,
    },
    "has-many-through": {
        c1StoriesThroughCitizens: ["s1", "s2", "s3"],
        c2StoriesThroughCitizens: ["s4"],
        lazyLoadedC1: ["s1", "s2", "s3"],
        hasOneThroughC1NotNull: true,
        hasOneThroughC3Null: true,
    },
    "prepared-queries": {
        leadNames: ["Ada"],
        memberNames: ["Ben", "Cy"],
        missingPlaceholderThrew: true,
    },
    "schema-diff-generate": {
        archivedColumnNowQueryable: true,
    },
    transactions: {
        atomicInsertCommittedCount: 2,
        rollbackThrew: true,
        partialWriteDiscarded: true,
        countUnchangedAfterRollback: 2,
    },
    "tx-increment-decrement": {
        aliceBalanceAfterTransfer: 70,
        bobBalanceAfterTransfer: 30,
        totalPreserved: true,
        rollbackThrew: true,
        incrementRolledBack: true,
    },
};

async function main(): Promise<void> {
    const proxy = await getPlatformProxy();
    const env = proxy.env as unknown as { DB: D1Database; CACHE: KVNamespace; APP_NAME: string };
    configure(env as unknown as Record<string, unknown>);

    let failures = 0;
    let checks = 0;

    for (const f of showcaseFeatures) {
        const expected = EXPECTED[f.key];
        try {
            const result = (await f.run(env as never)) as Json;
            const bad: string[] = [];
            for (const [k, want] of Object.entries(expected ?? {})) {
                checks++;
                if (!eq(result[k], want)) {
                    failures++;
                    bad.push(`      ${k}: expected ${JSON.stringify(want)}, got ${JSON.stringify(result[k])}`);
                }
            }
            if (bad.length === 0) {
                console.log(`  ✅ ${f.number}. ${f.feature}`);
            } else {
                console.log(`  ❌ ${f.number}. ${f.feature}`);
                for (const line of bad) console.log(line);
            }
        } catch (e) {
            failures++;
            console.log(`  ❌ ${f.number}. ${f.feature} - THREW: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    await proxy.dispose();

    console.log(
        `\n${failures === 0 ? "✅ PASS" : "❌ FAIL"} - ${checks - failures}/${checks} assertions across ${showcaseFeatures.length} features`,
    );
    if (failures > 0) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
