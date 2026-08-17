/**
 * Dedicated demo models for the /api/features showcase.
 *
 * A handful of beta.3 features need model configuration the domain models
 * (Workspace/User/Project/Task/Post) don't carry - an `enumCast` column, a
 * user-defined `globalScope`, and a `hasManyThrough` / `hasOneThrough` chain.
 * Rather than bolt those onto the domain models (whose statuses use DB CHECK
 * constraints, not enumCast, etc.) we declare small, isolated showcase models
 * over their own `showcase_*` tables. Each is lifted verbatim from the shapes
 * proven in `src/features.integration.test.ts`.
 */
import { BaseModel, enumCast } from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

// ── Feature 5: enumCast (+ the beta.3 onInvalidRead opt-in) ─────────────────
export type ShowcaseDocStatus = "draft" | "published" | "archived";

interface ShowcaseDocAttrs {
    id?: string;
    status?: ShowcaseDocStatus;
    level?: 1 | 2 | 3 | null;
    /** Added by a schema-diff generated migration - see the feature-12 docs. */
    tags?: string | null;
}

/** Strict enum casting: an out-of-set value throws on write AND on read. */
export class ShowcaseDoc extends BaseModel<ShowcaseDocAttrs> {
    static table = "showcase_docs";
    static timestamps = false;
    static casts = {
        status: enumCast(["draft", "published", "archived"]),
        level: enumCast([1, 2, 3]),
    } as const;
}

/**
 * Same table, but `status` opts into the beta.3 `onInvalidRead: "null"` -
 * a legacy/out-of-set value already in the DB reads back as `null` instead of
 * throwing, so one bad row never 500s a whole list query.
 */
export class ShowcaseDocLenient extends BaseModel<ShowcaseDocAttrs> {
    static table = "showcase_docs";
    static timestamps = false;
    static casts = {
        status: enumCast(["draft", "published", "archived"], { onInvalidRead: "null" }),
    } as const;
}

interface ShowcaseDocRawAttrs {
    id?: string;
    status?: string;
    level?: number | null;
    tags?: string | null;
}

/**
 * Uncast view of the same table - used only to *plant* an out-of-set value the
 * cast-guarded models would reject on write, so the read-time behaviour of the
 * two models above can be demonstrated with a pure-ORM write (no raw SQL).
 */
export class ShowcaseDocRaw extends BaseModel<ShowcaseDocRawAttrs> {
    static table = "showcase_docs";
    static timestamps = false;
}

// ── Feature 9: user-defined global scopes + withoutGlobalScope(s) ───────────
// The scope reads an external "current tenant" the same way a real app would
// read it from auth context; the showcase endpoint flips it to prove the scope
// tracks live context.
let showcaseTenant = "t1";
export function setShowcaseTenant(tenant: string): void {
    showcaseTenant = tenant;
}

interface ShowcaseTenantDocAttrs {
    id?: string;
    tenant?: string;
    title?: string;
}

export class ShowcaseTenantDoc extends BaseModel<ShowcaseTenantDocAttrs> {
    static table = "showcase_tenant_docs";
    static timestamps = false;
    static globalScopes = {
        tenant: (q: QueryBuilder<ShowcaseTenantDoc>) => q.whereEq("tenant", showcaseTenant),
    };
}

// ── Feature 10: hasManyThrough / hasOneThrough (Country → Citizen → Article) ─
interface ShowcaseCountryAttrs {
    id?: string;
    name?: string;
}
interface ShowcaseCitizenAttrs {
    id?: string;
    country_id?: string;
    name?: string;
}
interface ShowcaseArticleAttrs {
    id?: string;
    citizen_id?: string;
    title?: string;
}

export class ShowcaseCitizen extends BaseModel<ShowcaseCitizenAttrs> {
    static table = "showcase_citizens";
    static timestamps = false;
}

export class ShowcaseArticle extends BaseModel<ShowcaseArticleAttrs> {
    static table = "showcase_articles";
    static timestamps = false;
}

export class ShowcaseCountry extends BaseModel<ShowcaseCountryAttrs> {
    static table = "showcase_countries";
    static timestamps = false;
    static relations: Record<string, TRelationDefinition> = {
        articles: {
            type: "hasManyThrough",
            model: () => ShowcaseArticle,
            through: () => ShowcaseCitizen,
            firstKey: "country_id", // showcase_citizens.country_id → country
            secondKey: "citizen_id", // showcase_articles.citizen_id → citizen
        },
        latestArticle: {
            type: "hasOneThrough",
            model: () => ShowcaseArticle,
            through: () => ShowcaseCitizen,
            firstKey: "country_id",
            secondKey: "citizen_id",
        },
    };
}
