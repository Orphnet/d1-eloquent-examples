import { BaseModel } from "@orphnet/d1-eloquent";
import type { TRelationDefinition } from "@orphnet/d1-eloquent";

import { FeatCitizen } from "./FeatCitizen";
import { FeatStory } from "./FeatStory";

interface FeatCountryAttrs {
    id: string;
    name: string;
}

type FeatCountryRelations = {
    /** hasManyThrough - every story written by any citizen of this country. */
    stories: FeatStory[];
    /** hasOneThrough - a single story reached through the citizen chain. */
    latestStory: FeatStory | null;
};

/**
 * FEATURE 10 - `hasManyThrough` / `hasOneThrough`. A country has many stories
 * *through* its citizens: `feat_citizens.country_id → country`,
 * `feat_stories.citizen_id → citizen`.
 */
export class FeatCountry extends BaseModel<FeatCountryAttrs, {}, FeatCountryRelations> {
    static override table = "feat_countries";
    static override guarded = [];
    static override timestamps = false;

    static override relations: Record<string, TRelationDefinition> = {
        stories: {
            type: "hasManyThrough",
            model: () => FeatStory,
            through: () => FeatCitizen,
            firstKey: "country_id", // feat_citizens.country_id → country
            secondKey: "citizen_id", // feat_stories.citizen_id → citizen
        },
        latestStory: {
            type: "hasOneThrough",
            model: () => FeatStory,
            through: () => FeatCitizen,
            firstKey: "country_id",
            secondKey: "citizen_id",
        },
    };
}
