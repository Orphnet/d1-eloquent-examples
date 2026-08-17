import { getPlatformProxy } from "wrangler";
import { fake, output } from "@orphnet/d1-eloquent/cli";
import type { TSeeder, TSeederOpts } from "@orphnet/d1-eloquent/cli";
import { configure } from "@orphnet/d1-eloquent";

import { Workspace } from "../../src/models/Workspace";
import { User } from "../../src/models/User";
import { Project } from "../../src/models/Project";
import { WorkspaceSetting } from "../../src/models/WorkspaceSetting";
import type { WorkspaceSettingTheme } from "../../src/models/WorkspaceSetting";
import { MetricSnapshot } from "../../src/models/MetricSnapshot";
import { AuditEvent } from "../../src/models/AuditEvent";
import { ReleaseAsset } from "../../src/models/ReleaseAsset";
import { AssetDependency } from "../../src/models/AssetDependency";

/**
 * Populates the JSON / analytics / generated-column / composite-FK tables for
 * the demo workspace. Run AFTER WorkspaceSeeder (it reads the `acme` workspace,
 * its projects, and its users). Demonstrates:
 *
 *   - JSON casts (object + array) on workspace_settings
 *   - full cast matrix (json/array/boolean/integer/real/date/datetime/blob) on metric_snapshots
 *   - generated columns read back from audit_events
 *   - query-builder upsert() with a composite conflict target on release_assets
 *   - createMany() for batch inserts
 *   - composite-FK pivot rows on asset_dependencies
 */
const seeder: TSeeder = {
    name: "AnalyticsSeeder",
    description: "JSON settings, metric snapshots, audit ledger, releases + dependency graph.",

    async run(_opts: TSeederOpts) {
        // The CLI runs in Node (not a Worker), so obtain a real *local* D1 binding
        // via wrangler's platform proxy and register it in the connection registry.
        const proxy = await getPlatformProxy<{ DB: D1Database }>();
        configure({ DB: proxy.env.DB as unknown as D1Database });
        fake.seed(20260518);

        const workspace = await Workspace.query().whereEq("slug", "acme").first();
        if (!workspace) {
            output.info("AnalyticsSeeder: run WorkspaceSeeder first (no `acme` workspace found).");
            await proxy.dispose();
            return;
        }
        const wsId = workspace.get("id");

        const projects = await Project.query().whereEq("workspace_id", wsId).get();
        const userIds = (await User.query().select(["id"]).pluck("id")) as string[];

        // ── Workspace settings (JSON-heavy, single row) ──────────────────────
        await WorkspaceSetting.create({
            id: crypto.randomUUID(),
            workspace_id: wsId,
            prefs: {
                role: "owner",
                priority: 10,
                density: "comfortable",
                notifications: { email: 1, push: 0 },
                legacy: "remove-me",
            },
            feature_flags: ["beta-search", "json-aggregates", "live-feed"],
            // The mutator lower-cases this on write ("DARK" → "dark"). Cast
            // narrows to the column's literal type rather than escaping to `any`.
            theme: "DARK" as WorkspaceSettingTheme,
            webhook_secret: "whsec_" + fake.hex(16),
        });
        output.success("workspace_settings — 1 JSON-heavy row");

        // ── Metric snapshots (full cast matrix) ──────────────────────────────
        // A 1x1 transparent PNG as a tiny BLOB thumbnail.
        const pngBytes = Uint8Array.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]).buffer;

        let snapCount = 0;
        for (const p of projects) {
            const rows = Array.from({ length: 14 }, (_, day) => {
                const capturedOn = new Date(Date.now() - day * 86400_000)
                    .toISOString()
                    .slice(0, 10);
                const visits = fake.int(20, 500);
                return {
                    id: crypto.randomUUID(),
                    project_id: p.get("id"),
                    captured_on: capturedOn,
                    visits,
                    conversion_rate: fake.float(0, 1, 4),
                    is_partial: day === 0, // today is still partial
                    series: Array.from({ length: 6 }, (_, h) => ({
                        hour: h * 4,
                        visits: fake.int(0, Math.ceil(visits / 4)),
                    })),
                    breakdown: { direct: fake.int(0, visits), referral: fake.int(0, visits) },
                    thumbnail: pngBytes,
                    captured_at: new Date(`${capturedOn}T23:59:59.000Z`).toISOString(),
                };
            });
            const created = await MetricSnapshot.createMany(rows);
            snapCount += created.length;
        }
        output.success(`metric_snapshots — ${snapCount} rows (full cast matrix)`);

        // ── Audit events (generated columns) ─────────────────────────────────
        const severities: Array<"info" | "warning" | "error" | "critical"> = [
            "info",
            "info",
            "warning",
            "error",
            "critical",
        ];
        const auditRows = Array.from({ length: 24 }, () => {
            const sev = fake.pick(severities);
            return {
                id: crypto.randomUUID(),
                workspace_id: wsId,
                actor_id: fake.pick(userIds),
                action: fake.pick(["asset.published", "task.deleted", "settings.changed", "member.invited"]),
                resource_type: fake.pick(["task", "post", "release", "user"]),
                resource_id: crypto.randomUUID().slice(0, 8),
                severity: sev,
                amount_cents: fake.int(0, 50000),
                occurred_at: fake.pastDate(30),
                // severity_rank / event_label / amount_dollars are generated — omit them.
            };
        });
        await AuditEvent.createMany(auditRows);
        output.success(`audit_events — ${auditRows.length} rows (severity_rank/event_label/amount_dollars generated)`);

        // ── Release assets (upsert on composite PK) ──────────────────────────
        const versions = ["1.0.0", "1.1.0", "2.0.0-beta.1"];
        const assetKeys: { project_id: string; version: string }[] = [];
        for (const p of projects) {
            const pid = p.get("id");
            for (const version of versions) {
                const now = new Date().toISOString();
                await ReleaseAsset.query().upsert(
                    {
                        project_id: pid,
                        version,
                        channel: version.includes("beta") ? "beta" : "stable",
                        artifact_url: `https://cdn.example.com/${pid}/${version}.tar.gz`,
                        size_bytes: fake.int(1_000_000, 80_000_000),
                        published_at: now,
                        created_at: now,
                        updated_at: now,
                    },
                    ["project_id", "version"],
                );
                assetKeys.push({ project_id: pid, version });
            }
        }
        output.success(`release_assets — ${assetKeys.length} upserts on composite PK`);

        // ── Asset dependencies (composite-FK pivot) ──────────────────────────
        // Wire each project's 1.1.0 to require its own 1.0.0 (valid composite FKs).
        let edges = 0;
        for (const p of projects) {
            const pid = p.get("id");
            await AssetDependency.create({
                id: crypto.randomUUID(),
                dependent_project_id: pid,
                dependent_version: "1.1.0",
                requires_project_id: pid,
                requires_version: "1.0.0",
                requested_by: fake.pick(userIds),
                constraint_kind: "requires",
            });
            edges++;
        }
        output.success(`asset_dependencies — ${edges} composite-FK edges`);

        output.info("Analytics seed complete. Try:");
        output.info("  GET   /api/json/acme/settings");
        output.info("  GET   /api/json/acme/metrics/aggregate");
        output.info("  GET   /api/analytics/acme/top-contributors");
        output.info("  GET   /api/ledger/acme/events");
        output.info("  GET   /api/releases/_dynamic/channels");

        await proxy.dispose();
    },
};

export default seeder;
