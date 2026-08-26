import { t } from "@/lib/translations";

/**
 * Irrigation records: which field was watered, how much of it, when, and when
 * the next watering is due.
 *
 * The type and its sanitiser live here rather than in `field-data.ts` for the
 * same reason the soil ones do — the module owns its own shape, and the shared
 * document just composes them. Nothing here touches `node:fs` or Leaflet, so
 * the API route, the store and the browser all validate against this file.
 */

export const IRRIGATION_METHODS = ["drip", "sprinkler", "furrow", "pivot", "other"] as const;
export type IrrigationMethod = (typeof IRRIGATION_METHODS)[number];

export interface IrrigationLog {
  id: string;
  fieldId: string;
  // Denormalised so a record still reads correctly after its field is renamed
  // or deleted; the id is what links it back while the field still exists.
  fieldName: string;
  /** The day the water went on, as `YYYY-MM-DD`. */
  date: string;
  /** How much of the field actually got water, in square metres. */
  areaSqm: number;
  /** Volume applied, in cubic metres. 0 means it was not recorded. */
  waterM3: number;
  method: IrrigationMethod;
  /** Planned next watering, `YYYY-MM-DD`; empty when nothing is planned yet. */
  nextDate: string;
}

// Ceilings, not expectations: 10⁹ m² is 100 000 ha, far past any single parcel,
// and the same bound on volume keeps a malformed payload out of the arithmetic.
const MAX_AREA_SQM = 1e9;
const MAX_WATER_M3 = 1e9;

// Before methods became keys they were stored as the English labels the old
// form put in the option values. Map those back instead of dropping them.
const METHOD_ALIASES: Record<string, IrrigationMethod> = {
  drip: "drip",
  "drip irrigation": "drip",
  sprinkler: "sprinkler",
  furrow: "furrow",
  "flood / furrow": "furrow",
  pivot: "pivot",
  "center pivot": "pivot",
};

function readString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Keeps plain calendar days only; anything else becomes "no date". */
function isoDay(value: unknown): string {
  if (typeof value !== "string") return "";
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  return Number.isNaN(Date.parse(day)) ? "" : day;
}

/**
 * Reads a measured quantity. `parseFloat` rather than `Number` on purpose:
 * records written before this module stored numbers kept the volume as text
 * with its unit ("20 m³"), and those should survive the upgrade.
 */
function quantity(value: unknown, max: number): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, max);
}

function normalizeMethod(value: unknown): IrrigationMethod {
  if (typeof value !== "string") return "other";
  const key = value.trim().toLowerCase();
  if ((IRRIGATION_METHODS as readonly string[]).includes(key)) return key as IrrigationMethod;
  return METHOD_ALIASES[key] ?? "other";
}

export function sanitizeIrrigationLogs(value: unknown): IrrigationLog[] {
  if (!Array.isArray(value)) return [];
  const result: IrrigationLog[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    if (typeof source.id !== "string" || source.id === "") continue;
    result.push({
      id: source.id.slice(0, 64),
      fieldId: readString(source.fieldId, 64),
      fieldName: readString(source.fieldName, 128),
      date: isoDay(source.date),
      areaSqm: quantity(source.areaSqm, MAX_AREA_SQM),
      // `amount` is what the pre-numeric records called the volume.
      waterM3: quantity(source.waterM3 ?? source.amount, MAX_WATER_M3),
      method: normalizeMethod(source.method),
      nextDate: isoDay(source.nextDate),
    });
  }
  return result;
}

export function methodLabel(method: IrrigationMethod): string {
  return t.irrigation.methods[method];
}

/**
 * Local calendar day. `toISOString` alone would answer with the UTC day, which
 * is the wrong one for part of every evening east of Greenwich — and "today"
 * has to mean the farmer's today.
 */
export function toIsoDay(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return toIsoDay(new Date());
}

export function addDays(dayIso: string, days: number): string {
  const parsed = Date.parse(dayIso);
  if (Number.isNaN(parsed)) return "";
  // Both sides are UTC midnights, so this stays free of daylight-saving drift.
  return new Date(parsed + days * 86400000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; null when either day is unusable. */
export function daysBetween(from: string, to: string): number | null {
  const left = Date.parse(from);
  const right = Date.parse(to);
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return Math.round((right - left) / 86400000);
}

export type DueLevel = "overdue" | "today" | "soon" | "later";

export interface DueStatus {
  level: DueLevel;
  /** Negative once the planned day has passed. */
  days: number;
  label: string;
}

/** How a planned watering reads against today: due, overdue, or still ahead. */
export function dueStatus(nextDate: string, today: string = todayIso()): DueStatus | null {
  const days = daysBetween(today, nextDate);
  if (days === null) return null;
  if (days < 0) {
    return { level: "overdue", days, label: t.irrigation.overdue.replace("{n}", String(-days)) };
  }
  if (days === 0) return { level: "today", days, label: t.irrigation.dueToday };
  if (days === 1) return { level: "soon", days, label: t.irrigation.dueTomorrow };
  return {
    level: days <= 3 ? "soon" : "later",
    days,
    label: t.irrigation.inDays.replace("{n}", String(days)),
  };
}

export function dueBadgeClass(level: DueLevel): string {
  switch (level) {
    case "overdue":
      return "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300";
    case "today":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300";
    case "soon":
      return "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300";
    default:
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  }
}

// The rest of the app already prints areas with Turkish digit grouping; these
// keep the module reading the same way.
const LOCALE = "tr-TR";

export function formatArea(sqm: number): string {
  return `${Math.round(sqm).toLocaleString(LOCALE)} m²`;
}

export function formatDecares(sqm: number): string {
  return `${(sqm / 1000).toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${t.irrigation.decareShort}`;
}

export function formatWater(m3: number): string {
  return `${m3.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} m³`;
}

/**
 * Millimetres of water put on the watered area — a cubic metre spread over a
 * square metre is a metre deep, so m³ × 1000 ÷ m² is millimetres. It is the
 * number that compares directly with rainfall in the weather panel.
 */
export function appliedDepthMm(waterM3: number, areaSqm: number): number | null {
  if (waterM3 <= 0 || areaSqm <= 0) return null;
  return (waterM3 * 1000) / areaSqm;
}

/** Newest first; records without a usable date sort to the bottom. */
export function byNewestIrrigation(a: IrrigationLog, b: IrrigationLog): number {
  const left = Date.parse(a.date);
  const right = Date.parse(b.date);
  if (Number.isNaN(left) && Number.isNaN(right)) return 0;
  if (Number.isNaN(left)) return 1;
  if (Number.isNaN(right)) return -1;
  return right - left;
}

export interface FieldIrrigationSummary {
  logs: IrrigationLog[];
  last: IrrigationLog | undefined;
  /** The plan carried by the most recent record, if it has one. */
  next: string;
  totalAreaSqm: number;
  totalWaterM3: number;
}

export function summarizeField(logs: IrrigationLog[], fieldId: string): FieldIrrigationSummary {
  const fieldLogs = logs.filter((log) => log.fieldId === fieldId).sort(byNewestIrrigation);
  return {
    logs: fieldLogs,
    last: fieldLogs[0],
    // Only the newest record's plan counts. An older one was superseded the
    // moment the field was watered again, whether or not a new date was set.
    next: fieldLogs[0]?.nextDate ?? "",
    totalAreaSqm: fieldLogs.reduce((sum, log) => sum + log.areaSqm, 0),
    totalWaterM3: fieldLogs.reduce((sum, log) => sum + log.waterM3, 0),
  };
}

export interface IrrigationPlan {
  fieldId: string;
  fieldName: string;
  date: string;
}

/**
 * The next watering for every field that has one, soonest first — including the
 * ones already overdue, which are exactly the rows worth seeing first.
 */
export function upcomingPlans(logs: IrrigationLog[]): IrrigationPlan[] {
  const newestByField = new Map<string, IrrigationLog>();
  for (const log of logs) {
    if (!log.fieldId) continue;
    const current = newestByField.get(log.fieldId);
    if (!current || byNewestIrrigation(log, current) < 0) newestByField.set(log.fieldId, log);
  }
  return [...newestByField.values()]
    .filter((log) => log.nextDate !== "")
    .map((log) => ({ fieldId: log.fieldId, fieldName: log.fieldName, date: log.nextDate }))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

/** The form state. Measurements stay as strings: a blank input is not a zero. */
export interface IrrigationDraft {
  fieldId: string;
  date: string;
  area: string;
  water: string;
  method: IrrigationMethod;
  nextDate: string;
}

export function createDraft(fieldId: string, fieldAreaSqm: number): IrrigationDraft {
  return {
    fieldId,
    date: todayIso(),
    // Watering the whole parcel is the common case, so the drawn area is the
    // starting point; anything less is a correction the user types over it.
    area: fieldAreaSqm > 0 ? String(Math.round(fieldAreaSqm)) : "",
    water: "",
    method: "drip",
    nextDate: "",
  };
}

/** Reads a number out of a draft field, treating blank and junk alike as none. */
export function draftNumber(value: string): number {
  const parsed = parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
