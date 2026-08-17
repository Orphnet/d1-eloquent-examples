import { BaseModel } from "@orphnet/d1-eloquent";
import type { QueryBuilder } from "@orphnet/d1-eloquent";

interface FeatScopedDocAttrs {
    id: string;
    tenant?: string;
    title?: string;
}

/**
 * The "current tenant" the global scope filters on. In a real app this would be
 * read from request context (a header, an auth session); the showcase loader
 * flips it to prove the scope tracks external state on every query.
 */
export let currentTenant = "t1";
export function setCurrentTenant(tenant: string): void {
    currentTenant = tenant;
}

/**
 * FEATURE 9 - a user-defined `static globalScopes` entry auto-applied to every
 * query, removable per-query via `withoutGlobalScope("tenant")` /
 * `withoutGlobalScopes()`.
 */
export class FeatScopedDoc extends BaseModel<FeatScopedDocAttrs> {
    static override table = "feat_scoped_docs";
    static override guarded = [];
    static override timestamps = false;
    static override globalScopes = {
        tenant: (q: QueryBuilder<FeatScopedDoc>) => q.whereEq("tenant", currentTenant),
    };
}
