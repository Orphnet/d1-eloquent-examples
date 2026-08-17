import { BaseModel } from "@orphnet/d1-eloquent";
import type { QueryBuilder } from "@orphnet/d1-eloquent";

interface FeatArticleAttrs {
    id: string;
    title: string;
    slug: string;
    status: "draft" | "published" | "archived";
    views: number;
    published_at: string | null;
    /**
     * FEATURE 12 (schema-diff generate): this column is declared on the model
     * but was NOT in the create-table migration - the drift `d1-eloquent
     * generate` detects and emits `..._alter_feat_articles_add_archived.ts` for.
     */
    archived: boolean;
    created_at?: Date;
    updated_at?: Date;
    deleted_at?: string | null;
}

/** Backs features 3 (replicate / wasRecentlyCreated), 7 (intersect / except with
 * soft-delete scoping), and 8 (date-part wheres on `published_at`). */
export class FeatArticle extends BaseModel<FeatArticleAttrs> {
    static override table = "feat_articles";
    static override guarded = [];
    static override softDeletes = true;
    static override casts = { views: "integer", archived: "boolean" } as const;

    static override scopes: Record<string, (q: QueryBuilder<FeatArticle>) => void> = {
        published: (q) => q.whereEq("status", "published"),
    };
}
