import { BaseModel } from "@orphnet/d1-eloquent";

interface FeatStoryAttrs {
    id: string;
    citizen_id: string;
    title: string;
}

/** The final/related model for feature 10 - reached from Country *through* Citizen. */
export class FeatStory extends BaseModel<FeatStoryAttrs> {
    static override table = "feat_stories";
    static override guarded = [];
    static override timestamps = false;
}
