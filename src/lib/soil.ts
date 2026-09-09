import { t } from "@/lib/translations";
import soilTable from "../../shared/soil-parameters.json";

// Measurements are held as strings because they come straight out of controlled
// inputs and a blank field has to stay blank — "not measured" is a real state on
// a lab report, and 0 is a different answer from it.
export interface SoilAnalysis {
  id: string;
  fieldId: string;
  // Denormalised so a record still reads correctly after its field is renamed
  // or deleted; the id is what links it back while the field still exists.
  fieldName: string;
  sampleDate: string;
  depth: string;
  lab: string;
  texture: string;
  notes: string;
  ph: string;
  ec: string;
  lime: string;
  organicMatter: string;
  phosphorus: string;
  potassium: string;
  nitrogen: string;
  iron: string;
  zinc: string;
  manganese: string;
  copper: string;
}

/** Which numeric measurements a record carries. */
export type SoilMeasurementKey =
  | "ph"
  | "ec"
  | "lime"
  | "organicMatter"
  | "phosphorus"
  | "potassium"
  | "nitrogen"
  | "iron"
  | "zinc"
  | "manganese"
  | "copper";

// Drives the badge colour. "low" and "high" both mean "worth acting on", they
// just say which direction; the wording in the band is what explains it.
export type SoilLevel = "low" | "optimal" | "high";

export interface SoilRating {
  level: SoilLevel;
  label: string;
}

interface Band {
  /** Upper bound, exclusive. The last band in a list omits it to catch the rest. */
  below?: number;
  level: SoilLevel;
  label: string;
}

export interface SoilParameter {
  key: SoilMeasurementKey;
  label: string;
  unit: string;
  hint?: string;
  placeholder: string;
  /** Which section of the form the input belongs to. */
  group: "macro" | "micro";
  bands: Band[];
}

/**
 * The interpretation table, read from `shared/soil-parameters.json`.
 *
 * The data is deliberately not written here. The server renders the same bands
 * into the assistant's prompt ("Organic Matter 1.4 % (Low)"), and a copy of
 * this table in Rust would be a second answer to what counts as low. The ten
 * lines of `rateMeasurement` below are written on each side; the thresholds and
 * the wording are read from the one file. `shared/fixtures/rate-measurement.json`
 * is what keeps the two readings of it honest.
 */
export const SOIL_PARAMETERS = soilTable.parameters as SoilParameter[];

export const SOIL_TEXTURES: string[] = [
  t.soil.textures.sandy,
  t.soil.textures.sandyLoam,
  t.soil.textures.loam,
  t.soil.textures.siltLoam,
  t.soil.textures.clayLoam,
  t.soil.textures.siltyClay,
  t.soil.textures.clay,
];

/** Values shown at a glance on the summary card, in this order. */
export const SOIL_SUMMARY_KEYS: SoilMeasurementKey[] = [
  "ph",
  "organicMatter",
  "phosphorus",
  "potassium",
];

/**
 * The organic / inorganic split, which is how a report reads when a
 * fertilisation is being written against it: how much of the soil is organic
 * matter, and what the mineral side of it holds.
 *
 * pH and salinity are deliberately in neither list. They describe the state of
 * the soil rather than a proportion of matter in it, and a dosage is not read
 * off them. Total nitrogen sits on the mineral side despite being largely
 * organically bound, because it is the N of the N-P-K the dosage is chosen from.
 */
export const SOIL_ORGANIC_KEYS: SoilMeasurementKey[] = ["organicMatter"];

export const SOIL_INORGANIC_KEYS: SoilMeasurementKey[] = [
  "nitrogen",
  "phosphorus",
  "potassium",
  "lime",
  "iron",
  "zinc",
  "manganese",
  "copper",
];

const PARAMETERS_BY_KEY = Object.fromEntries(
  SOIL_PARAMETERS.map((parameter) => [parameter.key, parameter])
) as Record<SoilMeasurementKey, SoilParameter>;

/** The definition behind a measurement key: its label, unit and bands. */
export function soilParameter(key: SoilMeasurementKey): SoilParameter {
  return PARAMETERS_BY_KEY[key];
}

export function parseMeasurement(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  // Accept the comma decimal separator that a Turkish keyboard produces.
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function rateMeasurement(parameter: SoilParameter, value: string): SoilRating | null {
  const parsed = parseMeasurement(value);
  if (parsed === null) return null;
  for (const band of parameter.bands) {
    if (band.below === undefined || parsed < band.below) {
      return { level: band.level, label: band.label };
    }
  }
  return null;
}

export function hasAnyMeasurement(analysis: Pick<SoilAnalysis, SoilMeasurementKey>): boolean {
  return SOIL_PARAMETERS.some(
    (parameter) => parseMeasurement(analysis[parameter.key]) !== null
  );
}

/**
 * Which of `keys` the report actually carries a reading for. A lab omits
 * whatever was not ordered, so a caller that wants to draw only the measured
 * values filters through this rather than rendering a row of blanks.
 */
export function measuredKeys(
  analysis: Pick<SoilAnalysis, SoilMeasurementKey>,
  keys: readonly SoilMeasurementKey[]
): SoilMeasurementKey[] {
  return keys.filter((key) => parseMeasurement(analysis[key]) !== null);
}

const LEVEL_BADGES: Record<SoilLevel, string> = {
  low: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  optimal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
};

export function levelBadgeClass(level: SoilLevel): string {
  return LEVEL_BADGES[level];
}

const EMPTY_FIELDS = {
  texture: "",
  notes: "",
  ph: "",
  ec: "",
  lime: "",
  organicMatter: "",
  phosphorus: "",
  potassium: "",
  nitrogen: "",
  iron: "",
  zinc: "",
  manganese: "",
  copper: "",
} as const;

export type SoilDraft = Omit<SoilAnalysis, "id" | "fieldName">;

export function createDraft(fieldId: string): SoilDraft {
  return {
    fieldId,
    sampleDate: new Date().toISOString().split("T")[0],
    depth: "0-30",
    lab: "",
    ...EMPTY_FIELDS,
  };
}

const TEXT_LIMIT = 200;

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value.slice(0, TEXT_LIMIT) : "";
}

/**
 * Records arrive from the stored document or from a request body, either of
 * which may hold something unexpected — an older version of the app, a
 * hand-edited file, a hostile payload. Anything without an id is dropped; every
 * other field falls back to blank so the UI never has to guard each read.
 */
export function sanitizeAnalyses(value: unknown): SoilAnalysis[] {
  if (!Array.isArray(value)) return [];
  const result: SoilAnalysis[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    if (typeof source.id !== "string" || source.id === "") continue;
    result.push({
      id: source.id.slice(0, 64),
      fieldId: readString(source, "fieldId"),
      fieldName: readString(source, "fieldName"),
      sampleDate: readString(source, "sampleDate"),
      depth: readString(source, "depth"),
      lab: readString(source, "lab"),
      texture: readString(source, "texture"),
      notes: readString(source, "notes"),
      ph: readString(source, "ph"),
      ec: readString(source, "ec"),
      lime: readString(source, "lime"),
      organicMatter: readString(source, "organicMatter"),
      phosphorus: readString(source, "phosphorus"),
      potassium: readString(source, "potassium"),
      nitrogen: readString(source, "nitrogen"),
      iron: readString(source, "iron"),
      zinc: readString(source, "zinc"),
      manganese: readString(source, "manganese"),
      copper: readString(source, "copper"),
    });
  }
  return result;
}

/**
 * Every analysis recorded for one field, newest sample first — so `[0]` is the
 * report that describes the soil as it stands. A blank id matches nothing on
 * purpose: it is what an empty field list leaves in a form, not a field whose
 * analyses should be shown.
 */
export function analysesForField(analyses: SoilAnalysis[], fieldId: string): SoilAnalysis[] {
  if (fieldId === "") return [];
  return analyses.filter((analysis) => analysis.fieldId === fieldId).sort(byNewestSample);
}

/** Newest sample first; records without a usable date sort to the bottom. */
export function byNewestSample(a: SoilAnalysis, b: SoilAnalysis): number {
  const left = Date.parse(a.sampleDate);
  const right = Date.parse(b.sampleDate);
  if (Number.isNaN(left) && Number.isNaN(right)) return 0;
  if (Number.isNaN(left)) return 1;
  if (Number.isNaN(right)) return -1;
  return right - left;
}
