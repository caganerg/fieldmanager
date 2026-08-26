import { sanitizeAnalyses, type SoilAnalysis } from "@/lib/soil";

/**
 * Shape of the document the server keeps on disk, and the validation that
 * everything crossing the wire goes through.
 *
 * This module is deliberately isomorphic — no `node:fs`, no Leaflet — so the
 * API route, the store and the browser can all agree on one definition. Dates
 * are ISO strings here; the client revives them into `Date` objects, because
 * JSON has no date type and a round trip must not quietly change what a field
 * holds.
 */

export const DATA_VERSION = 1;

// Ceilings, not expectations. They keep a malformed or hostile payload from
// filling the disk on a server that has no authentication in front of it.
const MAX_TEXT = 200;
const MAX_NAME = 128;
const MAX_ID = 64;
const LIMITS = {
  fields: 2000,
  groups: 500,
  coordinates: 5000,
  soilAnalyses: 5000,
  irrigationLogs: 10000,
  fertilizerLogs: 10000,
} as const;

export interface StoredField {
  id: string;
  name: string;
  coordinates: [number, number][];
  cropType?: string;
  plantDate?: string;
  harvestDate?: string;
  groupId?: string;
  color?: string;
}

export interface StoredGroup {
  id: string;
  name: string;
}

export interface IrrigationLog {
  id: string;
  fieldName: string;
  date: string;
  amount: string;
  method: string;
}

export interface FertilizerLog {
  id: string;
  fieldName: string;
  date: string;
  type: string;
  amount: string;
}

/** The parts of the document the app actually edits. */
export interface FieldData {
  fields: StoredField[];
  groups: StoredGroup[];
  soilAnalyses: SoilAnalysis[];
  irrigationLogs: IrrigationLog[];
  fertilizerLogs: FertilizerLog[];
}

export interface StoredDocument extends FieldData {
  version: number;
  /** Bumped on every accepted write, so a stale client can be told to reload. */
  revision: number;
  updatedAt: string;
}

export function emptyData(): FieldData {
  return {
    fields: [],
    groups: [],
    soilAnalyses: [],
    irrigationLogs: [],
    fertilizerLogs: [],
  };
}

export function emptyDocument(): StoredDocument {
  return {
    version: DATA_VERSION,
    revision: 0,
    updatedAt: new Date().toISOString(),
    ...emptyData(),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Optional strings collapse to `undefined` so they stay out of the JSON. */
function optionalText(value: unknown, max = MAX_TEXT): string | undefined {
  const result = text(value, max);
  return result === "" ? undefined : result;
}

/** Keeps only values a `Date` can actually be built from. */
function optionalDate(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function sanitizeCoordinates(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  const result: [number, number][] = [];
  for (const entry of value.slice(0, LIMITS.coordinates)) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const lat = Number(entry[0]);
    const lng = Number(entry[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    result.push([lat, lng]);
  }
  return result;
}

export function sanitizeFields(value: unknown): StoredField[] {
  if (!Array.isArray(value)) return [];
  const result: StoredField[] = [];
  for (const entry of value.slice(0, LIMITS.fields)) {
    const source = asRecord(entry);
    if (!source || typeof source.id !== "string" || source.id === "") continue;
    const coordinates = sanitizeCoordinates(source.coordinates);
    // Fewer than three corners is not a polygon; the map cannot draw it and the
    // area calculation would return zero, so the record is worse than useless.
    if (coordinates.length < 3) continue;
    result.push({
      id: source.id.slice(0, MAX_ID),
      name: text(source.name, MAX_NAME),
      coordinates,
      cropType: optionalText(source.cropType, MAX_NAME),
      plantDate: optionalDate(source.plantDate),
      harvestDate: optionalDate(source.harvestDate),
      groupId: optionalText(source.groupId, MAX_ID),
      color: optionalText(source.color, 32),
    });
  }
  return result;
}

export function sanitizeGroups(value: unknown): StoredGroup[] {
  if (!Array.isArray(value)) return [];
  const result: StoredGroup[] = [];
  for (const entry of value.slice(0, LIMITS.groups)) {
    const source = asRecord(entry);
    if (!source || typeof source.id !== "string" || source.id === "") continue;
    result.push({ id: source.id.slice(0, MAX_ID), name: text(source.name, MAX_NAME) });
  }
  return result;
}

function sanitizeLogs<T extends { id: string }>(
  value: unknown,
  limit: number,
  build: (source: Record<string, unknown>, id: string) => T
): T[] {
  if (!Array.isArray(value)) return [];
  const result: T[] = [];
  for (const entry of value.slice(0, limit)) {
    const source = asRecord(entry);
    if (!source || typeof source.id !== "string" || source.id === "") continue;
    result.push(build(source, source.id.slice(0, MAX_ID)));
  }
  return result;
}

export function sanitizeIrrigationLogs(value: unknown): IrrigationLog[] {
  return sanitizeLogs<IrrigationLog>(value, LIMITS.irrigationLogs, (source, id) => ({
    id,
    fieldName: text(source.fieldName, MAX_NAME),
    date: text(source.date, 32),
    amount: text(source.amount, 32),
    method: text(source.method, MAX_NAME),
  }));
}

export function sanitizeFertilizerLogs(value: unknown): FertilizerLog[] {
  return sanitizeLogs<FertilizerLog>(value, LIMITS.fertilizerLogs, (source, id) => ({
    id,
    fieldName: text(source.fieldName, MAX_NAME),
    date: text(source.date, 32),
    type: text(source.type, MAX_NAME),
    amount: text(source.amount, 32),
  }));
}

export function sanitizeData(value: unknown): FieldData {
  const source = asRecord(value);
  if (!source) return emptyData();
  return {
    fields: sanitizeFields(source.fields),
    groups: sanitizeGroups(source.groups),
    soilAnalyses: sanitizeAnalyses(source.soilAnalyses).slice(0, LIMITS.soilAnalyses),
    irrigationLogs: sanitizeIrrigationLogs(source.irrigationLogs),
    fertilizerLogs: sanitizeFertilizerLogs(source.fertilizerLogs),
  };
}

export function sanitizeDocument(value: unknown): StoredDocument {
  const source = asRecord(value);
  if (!source) return emptyDocument();
  const revision = Number(source.revision);
  return {
    version: DATA_VERSION,
    revision: Number.isFinite(revision) && revision >= 0 ? Math.floor(revision) : 0,
    updatedAt: optionalDate(source.updatedAt) ?? new Date().toISOString(),
    ...sanitizeData(source),
  };
}

export type { SoilAnalysis };
