import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  emptyDocument,
  sanitizeData,
  sanitizeDocument,
  type FieldData,
  type StoredDocument,
} from "@/lib/field-data";

/**
 * Field data lives in a single JSON file on the machine the app is installed
 * on. A file rather than a database because the app deploys as one long-running
 * process (see README) and the whole dataset is a few hundred polygons: one
 * file is something the operator can back up with `cp` and read with `less`,
 * and it adds no dependency and no setup step beyond a writable directory.
 *
 * Only ever import this from a route handler or another server module — it
 * touches the filesystem and would break a client bundle.
 *
 * `FIELDMANAGER_DATA_DIR` picks the directory; it defaults to `./data` next to
 * the project so a fresh clone works with no configuration at all.
 */

const FILE_NAME = "fieldmanager.json";

export function dataDir(): string {
  const configured = (process.env.FIELDMANAGER_DATA_DIR || "").trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data");
}

function dataFile(): string {
  return path.join(dataDir(), FILE_NAME);
}

/**
 * Writes are serialised through this chain. Two requests landing together would
 * otherwise both read the same revision and the slower one would silently undo
 * the faster one.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  // Keep the chain alive even if this task rejects.
  writeQueue = result.catch(() => undefined);
  return result;
}

async function loadDocument(): Promise<StoredDocument> {
  try {
    const raw = await readFile(dataFile(), "utf8");
    return sanitizeDocument(JSON.parse(raw));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    // A missing file is the normal first-run state, not a failure.
    if (code === "ENOENT") return emptyDocument();
    if (error instanceof SyntaxError) {
      // Refuse rather than silently starting over: the operator still has the
      // file and can fix or restore it.
      throw new Error(`Data file at ${dataFile()} is not valid JSON.`);
    }
    throw error;
  }
}

/**
 * The last parsed document, keyed by what the file looked like when it was
 * read. Parsing and sanitising a farm's worth of polygons on every request was
 * the bulk of the work in answering one.
 *
 * The key is the file's own mtime and size rather than a flag this module sets,
 * so an operator editing the JSON by hand is picked up on the next request. A
 * write here drops the entry as well, which covers the ordinary case without
 * waiting for a stat to disagree.
 */
let cache: { mtimeMs: number; size: number; document: StoredDocument } | null = null;

/**
 * The stored document. The result is shared between callers and **must not be
 * mutated** — sort or filter a copy. `saveData` builds a fresh document rather
 * than editing this one.
 */
export async function readDocument(): Promise<StoredDocument> {
  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(dataFile());
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return emptyDocument();
    throw error;
  }

  const cached = cache;
  if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
    return cached.document;
  }

  const document = await loadDocument();
  cache = { mtimeMs: stats.mtimeMs, size: stats.size, document };
  return document;
}

async function writeDocument(document: StoredDocument): Promise<void> {
  const directory = dataDir();
  await mkdir(directory, { recursive: true });
  // Write beside the target and rename over it, so a crash mid-write leaves the
  // previous file intact instead of a half-written one.
  const target = path.join(directory, FILE_NAME);
  const temporary = path.join(directory, `.${FILE_NAME}.${process.pid}.tmp`);
  await writeFile(temporary, JSON.stringify(document, null, 2), { mode: 0o600 });
  await rename(temporary, target);
  // The file this process just wrote is the file on disk; whatever was cached
  // describes the one before it.
  cache = null;
}

export interface SaveResult {
  ok: boolean;
  document: StoredDocument;
}

/**
 * Replaces the stored data. `baseRevision` is the revision the caller read
 * before editing; if the file has moved on since, nothing is written and the
 * current document comes back so the caller can reconcile.
 */
export function saveData(data: unknown, baseRevision: number): Promise<SaveResult> {
  return enqueue(async () => {
    const current = await readDocument();
    if (current.revision !== baseRevision) {
      return { ok: false, document: current };
    }
    const document: StoredDocument = {
      version: current.version,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      ...sanitizeData(data),
    };
    await writeDocument(document);
    return { ok: true, document };
  });
}

/** Where the data is being kept, for start-up logging and error messages. */
export function dataFileLocation(): string {
  return dataFile();
}

export type { FieldData, StoredDocument };
