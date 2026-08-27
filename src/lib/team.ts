/**
 * The vocabulary the people in a workspace are described with, plus the
 * activity log.
 *
 * The people themselves are accounts (`@/lib/auth`, stored by
 * `@/lib/server/auth-store`): one record per person, holding both the profile
 * the team panel shows and the credentials they sign in with. Roles live here
 * rather than there because the activity log and the field data reference them
 * too, and `field-data.ts` must be able to import them without pulling in
 * anything about passwords.
 */

export const USER_ROLES = ["admin", "agronomist", "operator", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACTIVITY_TYPES = [
  "field_add",
  "field_edit",
  "field_delete",
  "group_add",
  "user_add",
  "user_edit",
  "import",
  "default",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface ActivityItem {
  id: string;
  user: string;
  action: string;
  timestamp: number;
  type?: ActivityType;
}

export function defaultActivity(): ActivityItem {
  return {
    id: "act-init",
    user: "Field Manager",
    action: "Workspace initialized and ready",
    timestamp: Date.now(),
    type: "default",
  };
}

/** Oldest entries fall off; the log is a recent history, not an audit trail. */
export const ACTIVITY_LIMIT = 50;
