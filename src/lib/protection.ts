import { t } from "@/lib/translations";

/**
 * Crop protection records: what was put on a field to deal with a pest, when,
 * and by which of the two approaches.
 *
 * The type and its sanitiser live here rather than in `field-data.ts` for the
 * same reason the soil and irrigation ones do — the module owns its own shape
 * and the shared document just composes them. Nothing here touches `node:fs` or
 * Leaflet, so the API route, the store and the browser all validate against
 * this file.
 */

export const PROTECTION_METHODS = ["biological", "chemical"] as const;
export type ProtectionMethod = (typeof PROTECTION_METHODS)[number];

export interface ProtectionLog {
  id: string;
  fieldId: string;
  // Denormalised so a record still reads correctly after its field is renamed
  // or deleted; the id is what links it back while the field still exists.
  fieldName: string;
  /** The day of the treatment, as `YYYY-MM-DD`. */
  date: string;
  method: ProtectionMethod;
  /**
   * What was applied, in the grower's own words — a product name for a chemical
   * treatment, the released beneficial for a biological one.
   *
   * It is one field rather than two because it answers one question, and the
   * method already says how to read it. Two mutually exclusive columns would
   * mean every record carrying a blank one, and a form that hides half of
   * itself. Free text is deliberate: pesticide registrations differ by country
   * and change every season, and a list compiled here would be wrong somewhere
   * from the day it was written.
   */
  agent: string;
  /** The pest or disease being treated. */
  target: string;
  /**
   * Free text as well, because the units are not comparable: a pesticide is
   * dosed in ml or g per decare, a beneficial is released in individuals or
   * cards per decare. Storing a number would mean picking one and mangling the
   * other.
   */
  dose: string;
  notes: string;
}

const MAX_TEXT = 200;
const MAX_NAME = 128;

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
 * An unreadable method falls back to chemical. There is no neutral third state
 * to fall back to, and of the two that is both the commoner treatment and the
 * one whose record matters more — a residue question is asked of sprays, not of
 * released predators.
 */
function normalizeMethod(value: unknown): ProtectionMethod {
  return value === "biological" ? "biological" : "chemical";
}

export function sanitizeProtectionLogs(value: unknown): ProtectionLog[] {
  if (!Array.isArray(value)) return [];
  const result: ProtectionLog[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    if (typeof source.id !== "string" || source.id === "") continue;
    result.push({
      id: source.id.slice(0, 64),
      fieldId: readString(source.fieldId, 64),
      fieldName: readString(source.fieldName, MAX_NAME),
      date: isoDay(source.date),
      method: normalizeMethod(source.method),
      agent: readString(source.agent, MAX_NAME),
      target: readString(source.target, MAX_NAME),
      dose: readString(source.dose, 64),
      notes: readString(source.notes, MAX_TEXT),
    });
  }
  return result;
}

export function methodLabel(method: ProtectionMethod): string {
  return t.protection.methods[method];
}

/** What the "what was applied" field is called, which is method-dependent. */
export function agentLabel(method: ProtectionMethod): string {
  return method === "biological" ? t.protection.agentBiological : t.protection.agentChemical;
}

export function agentPlaceholder(method: ProtectionMethod): string {
  return method === "biological"
    ? t.protection.agentBiologicalPlaceholder
    : t.protection.agentChemicalPlaceholder;
}

export function dosePlaceholder(method: ProtectionMethod): string {
  return method === "biological"
    ? t.protection.doseBiologicalPlaceholder
    : t.protection.doseChemicalPlaceholder;
}

export function methodBadgeClass(method: ProtectionMethod): string {
  return method === "biological"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
    : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300";
}

/** Newest first; records without a usable date sort to the bottom. */
export function byNewestTreatment(a: ProtectionLog, b: ProtectionLog): number {
  const left = Date.parse(a.date);
  const right = Date.parse(b.date);
  if (Number.isNaN(left) && Number.isNaN(right)) return 0;
  if (Number.isNaN(left)) return 1;
  if (Number.isNaN(right)) return -1;
  return right - left;
}

/**
 * Every treatment recorded for one field, newest first. A blank id matches
 * nothing on purpose: it is what an empty field list leaves in a form, not a
 * field whose history should be shown.
 */
export function treatmentsForField(logs: ProtectionLog[], fieldId: string): ProtectionLog[] {
  if (fieldId === "") return [];
  return logs.filter((log) => log.fieldId === fieldId).sort(byNewestTreatment);
}

/** The form state. */
export type ProtectionDraft = Omit<ProtectionLog, "id" | "fieldName">;

export function createDraft(fieldId: string): ProtectionDraft {
  return {
    fieldId,
    date: new Date().toISOString().slice(0, 10),
    method: "chemical",
    agent: "",
    target: "",
    dose: "",
    notes: "",
  };
}
