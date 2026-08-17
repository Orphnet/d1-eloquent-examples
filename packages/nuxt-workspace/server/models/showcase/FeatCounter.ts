import { BaseModel } from "@orphnet/d1-eloquent";

interface FeatCounterAttrs {
    id: string;
    label: string;
    views: number;
    /** Nullable → proves increment() treats a NULL counter as 0 via COALESCE. */
    hits: number | null;
}

/** Backs feature 1 - atomic increment() / decrement() (QueryBuilder + instance). */
export class FeatCounter extends BaseModel<FeatCounterAttrs> {
    static override table = "feat_counters";
    static override guarded = [];
    static override timestamps = false;
    static override casts = { views: "integer", hits: "integer" } as const;
}
