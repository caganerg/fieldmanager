import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  ALL_FIELDS,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  isAccountRole,
  isAccountStatus,
  normalizeUsername,
  type AccountRole,
  type AccountStatus,
  type PublicAccount,
} from "@/lib/auth";
import { dataDir, dataFileLocation } from "@/lib/server/data-store";

/**
 * The people in a workspace — profile and credentials in one record — kept in
 * their own JSON file next to the field data.
 *
 * A separate file rather than another slice of `fieldmanager.json` on purpose:
 * the field document is read and rewritten wholesale by every browser that is
 * signed in, and password hashes must never take that trip. Nothing here is
 * ever handed to a client except through `toPublicAccount`, which leaves the
 * hash behind.
 *
 * An account without a `passwordHash` is a person who cannot sign in yet: the
 * team directory used to be a separate list, and this is what became of its
 * entries. Everything else about them — role, status, assigned fields — is the
 * same record the login uses.
 *
 * Only import this from a route handler or another server module.
 */

const FILE_NAME = "fieldmanager-auth.json";
const AUTH_VERSION = 1;

/** How long a browser stays signed in after logging in. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const SCRYPT_KEY_BYTES = 64;

interface StoredAccount {
  id: string;
  /** Empty for a person who has no way to sign in yet. */
  username: string;
  name: string;
  email: string;
  phone: string;
  role: AccountRole;
  status: AccountStatus;
  assignedFieldIds: string[];
  /** Empty when there is no login; never leaves this module. */
  passwordHash: string;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

interface StoredSession {
  /** SHA-256 of the cookie value, so the file alone cannot be replayed. */
  tokenHash: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
}

interface AuthDocument {
  version: number;
  accounts: StoredAccount[];
  sessions: StoredSession[];
  /** Set once the team list from the old field document has been taken over. */
  importedTeam?: boolean;
}

function authFile(): string {
  return path.join(dataDir(), FILE_NAME);
}

/** Writes are serialised, exactly as in `data-store`: read, change, write. */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  writeQueue = result.catch(() => undefined);
  return result;
}

function emptyDocument(): AuthDocument {
  return { version: AUTH_VERSION, accounts: [], sessions: [] };
}

const MAX_ASSIGNED_FIELDS = 2000;

function sanitizeAssignedFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [ALL_FIELDS];
  const ids = value
    .slice(0, MAX_ASSIGNED_FIELDS)
    .filter((id): id is string => typeof id === "string" && id !== "")
    .map((id) => id.slice(0, 64));
  // "all" is exclusive: keeping it alongside single ids would leave two
  // answers to the same question.
  return ids.includes(ALL_FIELDS) ? [ALL_FIELDS] : ids;
}

function sanitizeAccount(value: unknown): StoredAccount | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.id !== "string" || source.id === "") return null;
  const text = (input: unknown, max: number) =>
    typeof input === "string" ? input.slice(0, max) : "";
  return {
    id: source.id.slice(0, 64),
    username: normalizeUsername(source.username),
    name: text(source.name, 128),
    email: text(source.email, 128),
    phone: text(source.phone, 64),
    // An unreadable role falls back to the least privileged one, never to admin.
    role: isAccountRole(source.role) ? source.role : "viewer",
    status: isAccountStatus(source.status) ? source.status : "offline",
    assignedFieldIds: sanitizeAssignedFields(source.assignedFieldIds),
    passwordHash: typeof source.passwordHash === "string" ? source.passwordHash : "",
    mustChangePassword: source.mustChangePassword === true,
    createdAt: text(source.createdAt, 32) || new Date().toISOString(),
    lastLoginAt: text(source.lastLoginAt, 32) || undefined,
  };
}

function sanitizeSession(value: unknown): StoredSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.tokenHash !== "string" || source.tokenHash === "") return null;
  if (typeof source.accountId !== "string" || source.accountId === "") return null;
  const expiresAt = typeof source.expiresAt === "string" ? source.expiresAt : "";
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) return null;
  return {
    tokenHash: source.tokenHash.slice(0, 128),
    accountId: source.accountId.slice(0, 64),
    createdAt:
      typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString(),
    expiresAt,
  };
}

function sanitizeDocument(value: unknown): AuthDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyDocument();
  const source = value as Record<string, unknown>;
  const accounts = Array.isArray(source.accounts)
    ? source.accounts.slice(0, 500).map(sanitizeAccount).filter((a): a is StoredAccount => a !== null)
    : [];
  const now = Date.now();
  const sessions = Array.isArray(source.sessions)
    ? source.sessions
        .slice(0, 5000)
        .map(sanitizeSession)
        .filter((s): s is StoredSession => s !== null && Date.parse(s.expiresAt) > now)
    : [];
  return {
    version: AUTH_VERSION,
    accounts,
    sessions,
    importedTeam: source.importedTeam === true,
  };
}

async function readDocument(): Promise<AuthDocument> {
  try {
    const raw = await readFile(authFile(), "utf8");
    return sanitizeDocument(JSON.parse(raw));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return emptyDocument();
    if (error instanceof SyntaxError) {
      // Refuse rather than start over: starting over would silently hand the
      // installation back to the default admin password.
      throw new Error(`Account file at ${authFile()} is not valid JSON.`);
    }
    throw error;
  }
}

async function writeDocument(document: AuthDocument): Promise<void> {
  const directory = dataDir();
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, FILE_NAME);
  const temporary = path.join(directory, `.${FILE_NAME}.${process.pid}.tmp`);
  await writeFile(temporary, JSON.stringify(document, null, 2), { mode: 0o600 });
  await rename(temporary, target);
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEY_BYTES);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltPart, hashPart] = stored.split("$");
  if (scheme !== "scrypt" || !saltPart || !hashPart) return false;
  const expected = Buffer.from(hashPart, "base64");
  const derived = await scrypt(password, Buffer.from(saltPart, "base64"), expected.length);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * The client's view of a person. `full` is for administrators and for the
 * account itself: everybody signed in may see the directory, but when somebody
 * last signed in, and which accounts still carry a password they did not
 * choose, is not everybody's business.
 */
export function toPublicAccount(account: StoredAccount, full = false): PublicAccount {
  return {
    id: account.id,
    username: account.username,
    hasLogin: account.passwordHash !== "",
    name: account.name,
    email: account.email,
    phone: account.phone,
    role: account.role,
    status: account.status,
    assignedFieldIds: account.assignedFieldIds,
    createdAt: account.createdAt,
    ...(full
      ? {
          lastLoginAt: account.lastLoginAt,
          mustChangePassword: account.mustChangePassword,
        }
      : {}),
  };
}

/**
 * Creates the first administrator if the file has no accounts yet.
 *
 * The password is `FIELDMANAGER_ADMIN_PASSWORD` when the operator set one, and
 * the documented default otherwise. Landing on the default flags the account so
 * every sign-in asks for a new password until it is changed — the app is
 * reachable the moment it starts, and it keeps saying so until it is not.
 */
async function ensureSeeded(): Promise<void> {
  await enqueue(async () => {
    const document = await readDocument();
    if (document.accounts.length > 0) return;

    const configured = (process.env.FIELDMANAGER_ADMIN_PASSWORD || "").trim();
    const password = configured || DEFAULT_ADMIN_PASSWORD;
    document.accounts.push({
      id: randomUUID(),
      username: DEFAULT_ADMIN_USERNAME,
      name: "Administrator",
      email: "",
      phone: "",
      role: "admin",
      status: "online",
      assignedFieldIds: [ALL_FIELDS],
      passwordHash: await hashPassword(password),
      mustChangePassword: configured === "",
      createdAt: new Date().toISOString(),
    });
    await writeDocument(document);
    console.info(
      configured
        ? `Field Manager: created the "${DEFAULT_ADMIN_USERNAME}" account with FIELDMANAGER_ADMIN_PASSWORD.`
        : `Field Manager: created the "${DEFAULT_ADMIN_USERNAME}" account with the default password "${DEFAULT_ADMIN_PASSWORD}". Change it after signing in.`
    );
  });
}

/**
 * Takes over the team list an older version kept in the field document.
 *
 * Those entries were the same people this file now holds, minus a way to sign
 * in, so they come across as accounts without a password — an administrator can
 * give one out later. It runs once; the flag rather than "are there accounts
 * yet" is what stops it, since seeding always leaves one account behind.
 *
 * The field document is left alone. Its `users` key is simply no longer read,
 * and disappears the next time a browser saves.
 */
async function importLegacyTeam(): Promise<void> {
  await enqueue(async () => {
    const document = await readDocument();
    if (document.importedTeam) return;

    let legacy: unknown[] = [];
    try {
      // Read straight from the file rather than through `readDocument`: the
      // field document's sanitiser no longer knows about `users`, so going
      // through it would hand back a document with the very key we came for
      // already stripped.
      const raw = JSON.parse(await readFile(dataFileLocation(), "utf8")) as Record<string, unknown>;
      if (Array.isArray(raw.users)) legacy = raw.users;
    } catch {
      // No field document yet, or an unreadable one: nothing to take over, and
      // the data route is where that gets reported. Either way this must not
      // run again on every request.
    }

    let imported = 0;
    for (const entry of legacy.slice(0, 500)) {
      const source = entry as Record<string, unknown> | null;
      if (!source || typeof source !== "object") continue;
      const name = typeof source.name === "string" ? source.name.slice(0, 128) : "";
      const email = typeof source.email === "string" ? source.email.slice(0, 128) : "";
      if (!name) continue;
      // The seed member every workspace was created with is not a person; the
      // administrator account seeded here has already taken its place.
      if (source.id === "u1" && name === "Guest" && email === "guest@fieldmanager.local") continue;
      if (document.accounts.some((account) => account.name === name && account.email === email)) {
        continue;
      }

      document.accounts.push({
        id: randomUUID(),
        username: "",
        name,
        email,
        phone: typeof source.phone === "string" ? source.phone.slice(0, 64) : "",
        role: isAccountRole(source.role) ? source.role : "viewer",
        status: isAccountStatus(source.status) ? source.status : "offline",
        assignedFieldIds: sanitizeAssignedFields(source.assignedFieldIds),
        passwordHash: "",
        mustChangePassword: false,
        createdAt: new Date().toISOString(),
      });
      imported += 1;
    }

    document.importedTeam = true;
    await writeDocument(document);
    if (imported > 0) {
      console.info(
        `Field Manager: moved ${imported} team member(s) from the field data into the account file. They have no sign-in until an administrator gives them one.`
      );
    }
  });
}

/** Everything the store must have done before it can answer a request. */
export async function ensureReady(): Promise<void> {
  await ensureSeeded();
  await importLegacyTeam();
}

export async function listAccounts(full = false): Promise<PublicAccount[]> {
  await ensureReady();
  const document = await readDocument();
  return document.accounts
    .map((account) => toPublicAccount(account, full))
    .sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username));
}

export interface CreateAccountInput {
  name: string;
  email?: string;
  phone?: string;
  role: AccountRole;
  status?: AccountStatus;
  assignedFieldIds?: string[];
  /** Both, or neither: a person can be added without a way to sign in. */
  username?: string;
  password?: string;
}

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

export function createAccount(input: CreateAccountInput): Promise<StoreResult<PublicAccount>> {
  return enqueue(async () => {
    const document = await readDocument();
    const username = normalizeUsername(input.username);
    const password = input.password || "";
    if (username && document.accounts.some((account) => account.username === username)) {
      return { ok: false as const, error: "That username is already taken.", status: 409 };
    }
    if (document.accounts.length >= 500) {
      return { ok: false as const, error: "Account limit reached.", status: 409 };
    }
    const account: StoredAccount = {
      id: randomUUID(),
      username,
      name: input.name.slice(0, 128),
      email: (input.email || "").slice(0, 128),
      phone: (input.phone || "").slice(0, 64),
      role: input.role,
      status: input.status || "offline",
      assignedFieldIds: sanitizeAssignedFields(input.assignedFieldIds ?? [ALL_FIELDS]),
      passwordHash: password ? await hashPassword(password) : "",
      // Somebody else chose this password, so the owner is asked to replace it.
      mustChangePassword: password !== "",
      createdAt: new Date().toISOString(),
    };
    document.accounts.push(account);
    await writeDocument(document);
    return { ok: true as const, value: toPublicAccount(account, true) };
  });
}

export interface UpdateAccountInput {
  name?: string;
  email?: string;
  phone?: string;
  status?: AccountStatus;
  role?: AccountRole;
  assignedFieldIds?: string[];
  /** Gives a login to somebody who had none, or replaces an existing one. */
  username?: string;
  password?: string;
}

export function updateAccount(
  id: string,
  input: UpdateAccountInput
): Promise<StoreResult<PublicAccount>> {
  return enqueue(async () => {
    const document = await readDocument();
    const account = document.accounts.find((entry) => entry.id === id);
    if (!account) return { ok: false as const, error: "No such account.", status: 404 };

    if (input.role && input.role !== account.role && account.role === "admin") {
      // Demoting the last administrator would lock everybody out of account
      // management with no way back except editing the file by hand.
      const admins = document.accounts.filter((entry) => entry.role === "admin");
      if (admins.length <= 1) {
        return {
          ok: false as const,
          error: "This is the only administrator; promote another account first.",
          status: 409,
        };
      }
    }

    if (input.username !== undefined) {
      const username = normalizeUsername(input.username);
      if (
        username &&
        document.accounts.some((entry) => entry.id !== id && entry.username === username)
      ) {
        return { ok: false as const, error: "That username is already taken.", status: 409 };
      }
      account.username = username;
      // Taking the username away takes the login with it; leaving a hash
      // behind for a name nobody can type is just a stale secret.
      if (!username) {
        account.passwordHash = "";
        account.mustChangePassword = false;
        document.sessions = document.sessions.filter((session) => session.accountId !== id);
      }
    }

    if (input.name !== undefined) account.name = input.name.slice(0, 128);
    if (input.email !== undefined) account.email = input.email.slice(0, 128);
    if (input.phone !== undefined) account.phone = input.phone.slice(0, 64);
    if (input.status !== undefined) account.status = input.status;
    if (input.role !== undefined) account.role = input.role;
    if (input.assignedFieldIds !== undefined) {
      account.assignedFieldIds = sanitizeAssignedFields(input.assignedFieldIds);
    }
    if (input.password) {
      if (!account.username) {
        return {
          ok: false as const,
          error: "Give this person a username before setting a password.",
          status: 400,
        };
      }
      account.passwordHash = await hashPassword(input.password);
      account.mustChangePassword = true;
      // A reset password ends the sessions the old one opened.
      document.sessions = document.sessions.filter((session) => session.accountId !== id);
    }

    await writeDocument(document);
    return { ok: true as const, value: toPublicAccount(account, true) };
  });
}

export function deleteAccount(id: string): Promise<StoreResult<true>> {
  return enqueue(async () => {
    const document = await readDocument();
    const account = document.accounts.find((entry) => entry.id === id);
    if (!account) return { ok: false as const, error: "No such account.", status: 404 };
    if (account.role === "admin") {
      const admins = document.accounts.filter((entry) => entry.role === "admin");
      if (admins.length <= 1) {
        return {
          ok: false as const,
          error: "This is the only administrator; promote another account first.",
          status: 409,
        };
      }
    }
    document.accounts = document.accounts.filter((entry) => entry.id !== id);
    document.sessions = document.sessions.filter((session) => session.accountId !== id);
    await writeDocument(document);
    return { ok: true as const, value: true as const };
  });
}

/**
 * Replaces an account's own password. The current one must be given, so a
 * borrowed browser cannot be turned into a permanent account takeover.
 */
export function changeOwnPassword(
  id: string,
  currentPassword: string,
  newPassword: string,
  keepTokenHash: string | null
): Promise<StoreResult<PublicAccount>> {
  return enqueue(async () => {
    const document = await readDocument();
    const account = document.accounts.find((entry) => entry.id === id);
    if (!account) return { ok: false as const, error: "No such account.", status: 404 };
    if (!(await verifyPassword(currentPassword, account.passwordHash))) {
      return { ok: false as const, error: "Current password is not correct.", status: 403 };
    }
    account.passwordHash = await hashPassword(newPassword);
    account.mustChangePassword = false;
    // Every other browser signed in as this account is signed out; the one
    // doing the changing stays.
    document.sessions = document.sessions.filter(
      (session) => session.accountId !== id || session.tokenHash === keepTokenHash
    );
    await writeDocument(document);
    return { ok: true as const, value: toPublicAccount(account, true) };
  });
}

/** Verifies credentials. Returns the account, or null for any failure. */
export async function authenticate(
  username: string,
  password: string
): Promise<PublicAccount | null> {
  await ensureReady();
  const document = await readDocument();
  const wanted = normalizeUsername(username);
  const account = wanted
    ? document.accounts.find((entry) => entry.username === wanted && entry.passwordHash !== "")
    : undefined;
  if (!account) {
    // Hash anyway, so a missing username does not answer faster than a wrong
    // password and become a way to enumerate accounts.
    await hashPassword(password);
    return null;
  }
  if (!(await verifyPassword(password, account.passwordHash))) return null;
  return toPublicAccount(account, true);
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export function createSession(accountId: string): Promise<IssuedSession> {
  return enqueue(async () => {
    const document = await readDocument();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    document.sessions.push({
      tokenHash: hashToken(token),
      accountId,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    const account = document.accounts.find((entry) => entry.id === accountId);
    if (account) account.lastLoginAt = new Date().toISOString();
    await writeDocument(document);
    return { token, expiresAt };
  });
}

/** The account a cookie belongs to, or null if it is unknown or expired. */
export async function accountForToken(token: string): Promise<PublicAccount | null> {
  if (!token) return null;
  const document = await readDocument();
  const tokenHash = hashToken(token);
  const session = document.sessions.find((entry) => entry.tokenHash === tokenHash);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
  const account = document.accounts.find((entry) => entry.id === session.accountId);
  // A login that has been taken away ends the session with it.
  if (!account || account.passwordHash === "") return null;
  return toPublicAccount(account, true);
}

export function destroySession(token: string): Promise<void> {
  return enqueue(async () => {
    if (!token) return;
    const document = await readDocument();
    const tokenHash = hashToken(token);
    const before = document.sessions.length;
    document.sessions = document.sessions.filter((entry) => entry.tokenHash !== tokenHash);
    if (document.sessions.length !== before) await writeDocument(document);
  });
}

export function sessionTokenHash(token: string): string {
  return hashToken(token);
}

/** Where the accounts are being kept, for start-up logging and error messages. */
export function authFileLocation(): string {
  return authFile();
}
