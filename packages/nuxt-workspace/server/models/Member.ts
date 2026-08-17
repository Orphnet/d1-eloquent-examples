import { BaseModel } from "@orphnet/d1-eloquent";

/**
 * Concrete model for the `workspace_members` pivot row. d1-eloquent's
 * `belongsToMany` resolver doesn't require a model for the pivot itself —
 * but having one makes it easy to query/update pivot attributes like
 * `role` and `joined_at` directly when needed.
 */
interface MemberAttrs {
    workspace_id: string;
    user_id: string;
    role: string;
    joined_at: string;
}

export class Member extends BaseModel<MemberAttrs> {
    static override table = "workspace_members";
    static override primaryKey = "workspace_id"; // pivot has composite PK; we treat workspace_id as primary for lookups
    static override timestamps = false;
    static override guarded = [];
}
