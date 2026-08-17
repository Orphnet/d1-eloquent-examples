import { BaseModel, enumCast } from "@orphnet/d1-eloquent";

type DocStatus = "draft" | "published" | "archived";

interface FeatEnumDocAttrs {
    id: string;
    status?: DocStatus;
    level?: 1 | 2 | 3 | null;
}

/**
 * FEATURE 5 - `enumCast()`. Validates on write (create/save throw on a value
 * outside the set) and coerces on read. `level` shows the numeric-enum form.
 */
export class FeatEnumDoc extends BaseModel<FeatEnumDocAttrs> {
    static override table = "feat_enum_docs";
    static override guarded = [];
    static override timestamps = false;
    static override casts = {
        status: enumCast(["draft", "published", "archived"]),
        level: enumCast([1, 2, 3]),
    } as const;
}

/**
 * Same table, but opts into `onInvalidRead: "null"` - a row whose stored value
 * has drifted out of the set reads back as `null` instead of throwing. Lets the
 * showcase demonstrate the new beta.3 opt-in against a deliberately-bad row.
 */
export class FeatEnumDocLenient extends BaseModel<FeatEnumDocAttrs> {
    static override table = "feat_enum_docs";
    static override guarded = [];
    static override timestamps = false;
    static override casts = {
        status: enumCast(["draft", "published", "archived"], { onInvalidRead: "null" }),
        level: enumCast([1, 2, 3], { onInvalidRead: "null" }),
    } as const;
}
