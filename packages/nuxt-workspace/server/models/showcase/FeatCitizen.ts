import { BaseModel } from "@orphnet/d1-eloquent";

interface FeatCitizenAttrs {
    id: string;
    country_id: string;
    name: string;
}

/** The intermediate ("through") model for feature 10 - Country → Citizen → Story. */
export class FeatCitizen extends BaseModel<FeatCitizenAttrs> {
    static override table = "feat_citizens";
    static override guarded = [];
    static override timestamps = false;
}
