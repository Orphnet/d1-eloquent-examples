import { BaseModel } from "@orphnet/d1-eloquent";
import type { QueryBuilder, TRelationDefinition } from "@orphnet/d1-eloquent";

import { Workspace } from "./Workspace";
import { User } from "./User";

interface AuditEventAttrs {
    id: string;
    workspace_id: string;
    actor_id: string | null;
    action: string;
    resource_type: string;
    resource_id: string;
    severity: "info" | "warning" | "error" | "critical";
    amount_cents: number;
    /** STORED generated column — numeric rank derived from `severity`. Read-only. */
    severity_rank: number;
    /** VIRTUAL generated column — pre-formatted label. Read-only. */
    event_label: string;
    /** STORED generated column — dollars from `amount_cents`. Read-only. */
    amount_dollars: number;
    occurred_at: string;
    created_at?: Date;
    updated_at?: Date;
}

type AuditEventRelations = {
    workspace: Workspace | null;
    actor: User | null;
};

/**
 * Append-only audit ledger. The `severity_rank`, `event_label`, and
 * `amount_dollars` columns are SQLite GENERATED columns — they are computed by
 * the database, so this model never writes them. The RETURNING route reads them
 * back in the same round-trip as the INSERT.
 */
export class AuditEvent extends BaseModel<AuditEventAttrs, {}, AuditEventRelations> {
    static table = "audit_events";
    static guarded = [];
    static casts = {
        amount_cents: "integer",
        severity_rank: "integer",
        amount_dollars: "real",
    } as const;

    static relations: Record<string, TRelationDefinition> = {
        workspace: {
            type: "belongsTo",
            model: () => Workspace,
            foreignKey: "workspace_id",
        },
        actor: {
            type: "belongsTo",
            model: () => User,
            foreignKey: "actor_id",
        },
    };

    static scopes: Record<string, (q: QueryBuilder<AuditEvent>) => void> = {
        severe: (q) => q.where("severity_rank", ">=", 30),
    };
}
