import { BaseModel } from "@orphnet/d1-eloquent";

interface FeatAccountAttrs {
    id: string;
    name: string;
    balance: number;
}

/** Backs features 13 (transaction - atomic multi-row writes + rollback) and
 * 14 (tx.increment / tx.decrement - atomic balance transfer inside a tx). */
export class FeatAccount extends BaseModel<FeatAccountAttrs> {
    static override table = "feat_accounts";
    static override guarded = [];
    static override timestamps = false;
    static override casts = { balance: "integer" } as const;
}
