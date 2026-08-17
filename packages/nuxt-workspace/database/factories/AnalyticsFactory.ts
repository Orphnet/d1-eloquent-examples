import { Factory, fake } from "@orphnet/d1-eloquent/cli";

/**
 * Factories for the JSON / generated-column / RETURNING demo tables.
 * Generated columns (`total_cost`, `day_bucket`) are intentionally absent —
 * the database computes them.
 */
export class WorkspaceSettingFactory extends Factory<Record<string, unknown>> {
    readonly table = "workspace_settings";
    definition() {
        return {
            id: fake.uuid(),
            workspace_id: "",
            preferences: JSON.stringify({
                theme: fake.pick(["dark", "light"]),
                locale: "en-GB",
                integrations: { slack: fake.boolean(), github: true },
            }),
            feature_flags: JSON.stringify(fake.pickMany(["beta-search", "ai-summaries", "metrics-v2"], 2)),
            notifications_enabled: fake.boolean(0.8) ? 1 : 0,
            seat_limit: fake.int(5, 50),
            storage_quota_gb: fake.float(1, 100, 1),
            trial_ends_on: fake.futureDate(30, "Y-m-d"),
            activated_at: fake.now(),
            brand_logo: null,
            created_at: fake.now(),
            updated_at: fake.now(),
        };
    }
}

export class MetricEventFactory extends Factory<Record<string, unknown>> {
    readonly table = "metric_events";
    definition() {
        return {
            id: fake.uuid(),
            workspace_id: "",
            project_id: null,
            metric: fake.pick(["api_calls", "storage", "seats", "bandwidth"]),
            quantity: fake.int(0, 500),
            unit_cost: fake.float(0.001, 0.05, 4),
            dimensions: JSON.stringify({ region: fake.pick(["eu", "us", "apac"]) }),
            occurred_at: fake.pastDate(14),
            created_at: fake.now(),
            updated_at: fake.now(),
        };
    }
}

export class ReleaseFactory extends Factory<Record<string, unknown>> {
    readonly table = "releases";
    definition() {
        return {
            id: fake.uuid(),
            project_id: "",
            version: `1.${fake.int(0, 9)}.${fake.int(0, 9)}`,
            channel: fake.pick(["stable", "beta", "canary"]),
            notes: fake.sentence(),
            downloads: fake.int(0, 5000),
            artifacts: JSON.stringify([{ os: "linux", url: fake.url("dl") }]),
            published_at: fake.pastDate(60),
            created_at: fake.now(),
            updated_at: fake.now(),
        };
    }
}
