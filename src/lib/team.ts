/**
 * Team members and the activity log. Both are part of the workspace rather than
 * of one browser, so they live in the server document alongside the fields.
 *
 * The types and the seed data sit here rather than in `UsersMenu.tsx` so that
 * `field-data.ts` and `FieldDataProvider.tsx` can reach them without importing
 * the component that renders them — that would be a cycle, since the component
 * reads its data from the provider.
 */

export const USER_ROLES = ["admin", "agronomist", "operator", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["online", "in_field", "on_leave", "offline"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

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

export interface UserMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  roleTitle: string;
  initials: string;
  status: UserStatus;
  statusText: string;
  /** Either the single entry "all" or specific field ids. */
  assignedFieldIds: string[];
  joinedDate: string;
  lastActive: string;
  color: string;
}

export interface ActivityItem {
  id: string;
  user: string;
  action: string;
  timestamp: number;
  type?: ActivityType;
}

/** Seeded into a workspace that has no team yet, so the app is never empty. */
export const DEFAULT_USERS: UserMember[] = [
  {
    id: "u1",
    name: "Guest",
    email: "guest@fieldmanager.local",
    phone: "+1 (555) 000-0000",
    role: "admin",
    roleTitle: "System Administrator (Admin)",
    initials: "GU",
    status: "online",
    statusText: "Online",
    assignedFieldIds: ["all"],
    joinedDate: "01/01/2026",
    lastActive: "Active now",
    color: "bg-emerald-600 text-white",
  },
];

export function defaultActivity(): ActivityItem {
  return {
    id: "act-init",
    user: "Guest",
    action: "Workspace initialized and ready",
    timestamp: Date.now(),
    type: "default",
  };
}

/** Oldest entries fall off; the log is a recent history, not an audit trail. */
export const ACTIVITY_LIMIT = 50;
