import {
  USER_ROLES,
  USER_STATUSES,
  type UserRole,
  type UserStatus,
} from "@/lib/team";

/**
 * One record per person: the profile the team panel shows *and* the credentials
 * they sign in with.
 *
 * There used to be two lists — a team directory in the workspace document and a
 * set of login accounts — and keeping them apart meant adding somebody to the
 * farm twice. They are one thing now. What varies is whether a person has a way
 * in: an account with a username and a password can sign in, one without is a
 * directory entry an administrator can hand a login to later.
 *
 * Like `field-data.ts` this module is deliberately isomorphic — no `node:fs`,
 * no `node:crypto` — so the login form, the route handlers and the store all
 * validate against one definition. The hashing and the file live in
 * `@/lib/server/auth-store`, which never reaches the browser bundle.
 */

export const ACCOUNT_ROLES = USER_ROLES;
export type AccountRole = UserRole;

export const ACCOUNT_STATUSES = USER_STATUSES;
export type AccountStatus = UserStatus;

/** Seeded on first run, and announced in README.md so it can be changed. */
export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "admin";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;
export const MAX_USERNAME_LENGTH = 32;
export const MAX_NAME_LENGTH = 128;

/** Every field a person is assigned to, rather than a list of ids. */
export const ALL_FIELDS = "all";

/**
 * What the browser is allowed to see about a person: never the hash.
 *
 * `lastLoginAt` and `mustChangePassword` are filled in for administrators only
 * — everyone signed in can see the directory, but which accounts are still on a
 * password somebody else chose is not everyone's business.
 */
export interface PublicAccount {
  id: string;
  /** Empty when this person has no way to sign in yet. */
  username: string;
  hasLogin: boolean;
  name: string;
  email: string;
  phone: string;
  role: AccountRole;
  status: AccountStatus;
  /** Either the single entry "all" or specific field ids. */
  assignedFieldIds: string[];
  createdAt: string;
  lastLoginAt?: string;
  mustChangePassword?: boolean;
}

/** The signed-in account plus what this session may do with it. */
export interface SessionUser extends PublicAccount {
  canEdit: boolean;
  isAdmin: boolean;
  mustChangePassword: boolean;
}

/**
 * Viewers read the workspace but never write it. Enforced on the server in
 * `/api/data`; the client uses the same helper only to grey out the controls
 * that would fail.
 */
export function roleCanEdit(role: AccountRole): boolean {
  return role !== "viewer";
}

export function toSessionUser(account: PublicAccount): SessionUser {
  return {
    ...account,
    mustChangePassword: account.mustChangePassword === true,
    canEdit: roleCanEdit(account.role),
    isAdmin: account.role === "admin",
  };
}

/**
 * Usernames are compared case-insensitively and limited to characters that
 * survive a URL, a shell and a JSON file unchanged.
 */
export function normalizeUsername(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, MAX_USERNAME_LENGTH);
}

export function validateUsername(value: string): string | null {
  if (value.length < 3) return "Username must be at least 3 characters.";
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(value)) {
    return "Username may use letters, digits, dot, dash and underscore, and must start with a letter or digit.";
  }
  return null;
}

/**
 * Deliberately a length rule and nothing else. Composition rules push people
 * towards `Passw0rd!`; the honest defence here is length plus the fact that the
 * app is meant to sit on a trusted network.
 */
export function validatePassword(value: string): string | null {
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === "string" && (ACCOUNT_ROLES as readonly string[]).includes(value);
}

export function isAccountStatus(value: unknown): value is AccountStatus {
  return typeof value === "string" && (ACCOUNT_STATUSES as readonly string[]).includes(value);
}

/* Presentation. Derived rather than stored: two lists of people drifting apart
   is exactly what this module exists to prevent, and a stored initial or colour
   is one more thing that can disagree with the name it belongs to. */

export const ROLE_TITLES: Record<AccountRole, string> = {
  admin: "System Administrator (Admin)",
  agronomist: "Agronomist",
  operator: "Field & Equipment Operator",
  viewer: "Field Observer",
};

/** The short form, for badges where the full title does not fit. */
export const ROLE_SHORT_TITLES: Record<AccountRole, string> = {
  admin: "Admin",
  agronomist: "Agronomist",
  operator: "Operator",
  viewer: "Observer",
};

/** What the role means in this app — the rules the server actually enforces. */
export const ROLE_ACCESS: Record<AccountRole, string> = {
  admin: "Full access, and the only role that can manage people and accounts.",
  agronomist: "Reads and edits the whole workspace: fields, groups and records.",
  operator: "Reads and edits the whole workspace: fields, groups and records.",
  viewer: "Reads the workspace. The server rejects any change from this role.",
};

/** The longer description shown on the Roles tab. */
export const ROLE_DESCRIPTIONS: Record<AccountRole, string> = {
  admin: "Draws and manages field boundaries, adds and removes groups, invites people, and configures the workspace.",
  agronomist: "Creates and manages irrigation, fertilization and soil records, and follows weather and crop health.",
  operator: "Carries out daily work in the assigned fields and logs what was done.",
  viewer: "Follows field boundaries, status cards and live metrics without changing anything.",
};

export const STATUS_LABELS: Record<AccountStatus, string> = {
  online: "Online",
  in_field: "In Field / Inspection",
  on_leave: "On Leave",
  offline: "Offline",
};

export const ROLE_COLORS: Record<AccountRole, string> = {
  admin: "bg-emerald-600 text-white",
  agronomist: "bg-sky-600 text-white",
  operator: "bg-amber-600 text-white",
  viewer: "bg-purple-600 text-white",
};

/** First and last initial, falling back to the username, then to a dash. */
export function initialsFor(account: { name?: string; username?: string }): string {
  const source = (account.name || account.username || "").trim();
  if (!source) return "–";
  const parts = source.split(/\s+/);
  const initials =
    parts.length > 1
      ? parts[0][0] + parts[parts.length - 1][0]
      : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

export function hasAllFields(account: { assignedFieldIds: string[] }): boolean {
  return account.assignedFieldIds.includes(ALL_FIELDS);
}
