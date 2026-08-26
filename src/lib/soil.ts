import { t } from "@/lib/translations";

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

// Bands follow the classification tables Turkish soil laboratories print on
// their reports: pH and salinity on the 1:2.5 saturation extract, phosphorus
// and potassium as kg/da of P₂O₅ and K₂O, micronutrients as DTPA-extractable
// ppm. They are interpretation aids, not crop-specific recommendations.
export const SOIL_PARAMETERS: SoilParameter[] = [
  {
    key: "ph",
    label: t.soil.ph,
    unit: "",
    hint: t.soil.phHint,
    placeholder: "7.2",
    group: "macro",
    bands: [
      { below: 4.5, level: "low", label: t.soil.stronglyAcidic },
      { below: 5.5, level: "low", label: t.soil.moderatelyAcidic },
      { below: 6.5, level: "low", label: t.soil.slightlyAcidic },
      { below: 7.5, level: "optimal", label: t.soil.neutral },
      { below: 8.5, level: "high", label: t.soil.slightlyAlkaline },
      { level: "high", label: t.soil.stronglyAlkaline },
    ],
  },
  {
    key: "ec",
    label: t.soil.ec,
    unit: "dS/m",
    placeholder: "0.8",
    group: "macro",
    bands: [
      { below: 4, level: "optimal", label: t.soil.nonSaline },
      { below: 8, level: "high", label: t.soil.slightlySaline },
      { below: 15, level: "high", label: t.soil.moderatelySaline },
      { level: "high", label: t.soil.highlySaline },
    ],
  },
  {
    key: "lime",
    label: t.soil.lime,
    unit: "%",
    placeholder: "4.5",
    group: "macro",
    bands: [
      { below: 1, level: "optimal", label: t.soil.lowLime },
      { below: 5, level: "optimal", label: t.soil.calcareous },
      { below: 15, level: "high", label: t.soil.moderatelyCalcareous },
      { below: 25, level: "high", label: t.soil.highlyCalcareous },
      { level: "high", label: t.soil.veryHighlyCalcareous },
    ],
  },
  {
    key: "organicMatter",
    label: t.soil.organicMatter,
    unit: "%",
    placeholder: "2.1",
    group: "macro",
    bands: [
      { below: 1, level: "low", label: t.soil.veryLow },
      { below: 2, level: "low", label: t.soil.low },
      { below: 3, level: "optimal", label: t.soil.medium },
      { below: 4, level: "optimal", label: t.soil.good },
      { level: "high", label: t.soil.high },
    ],
  },
  {
    key: "phosphorus",
    label: t.soil.phosphorus,
    unit: "kg/da",
    placeholder: "7",
    group: "macro",
    bands: [
      { below: 3, level: "low", label: t.soil.veryLow },
      { below: 6, level: "low", label: t.soil.low },
      { below: 9, level: "optimal", label: t.soil.medium },
      { below: 12, level: "optimal", label: t.soil.high },
      { level: "high", label: t.soil.veryHigh },
    ],
  },
  {
    key: "potassium",
    label: t.soil.potassium,
    unit: "kg/da",
    placeholder: "35",
    group: "macro",
    bands: [
      { below: 20, level: "low", label: t.soil.veryLow },
      { below: 30, level: "low", label: t.soil.low },
      { below: 40, level: "optimal", label: t.soil.sufficient },
      { below: 60, level: "optimal", label: t.soil.high },
      { level: "high", label: t.soil.veryHigh },
    ],
  },
  {
    key: "nitrogen",
    label: t.soil.nitrogen,
    unit: "%",
    placeholder: "0.12",
    group: "macro",
    bands: [
      { below: 0.045, level: "low", label: t.soil.veryLow },
      { below: 0.09, level: "low", label: t.soil.low },
      { below: 0.17, level: "optimal", label: t.soil.medium },
      { below: 0.32, level: "optimal", label: t.soil.good },
      { level: "high", label: t.soil.high },
    ],
  },
  {
    key: "iron",
    label: t.soil.iron,
    unit: "ppm",
    placeholder: "5.0",
    group: "micro",
    bands: [
      { below: 2.5, level: "low", label: t.soil.deficient },
      { below: 4.5, level: "low", label: t.soil.marginal },
      { level: "optimal", label: t.soil.sufficient },
    ],
  },
  {
    key: "zinc",
    label: t.soil.zinc,
    unit: "ppm",
    placeholder: "0.9",
    group: "micro",
    bands: [
      { below: 0.2, level: "low", label: t.soil.veryLow },
      { below: 0.7, level: "low", label: t.soil.low },
      { below: 2.4, level: "optimal", label: t.soil.sufficient },
      { level: "high", label: t.soil.high },
    ],
  },
  {
    key: "manganese",
    label: t.soil.manganese,
    unit: "ppm",
    placeholder: "10",
    group: "micro",
    bands: [
      { below: 4, level: "low", label: t.soil.deficient },
      { below: 14, level: "optimal", label: t.soil.sufficient },
      { level: "high", label: t.soil.high },
    ],
  },
  {
    key: "copper",
    label: t.soil.copper,
    unit: "ppm",
    placeholder: "1.2",
    group: "micro",
    bands: [
      { below: 0.2, level: "low", label: t.soil.deficient },
      { level: "optimal", label: t.soil.sufficient },
    ],
  },
];

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
 * Records come back from localStorage, where an older version of the app — or a
 * hand-edited entry — may have left something unexpected. Anything without an
 * id is dropped; every other field falls back to blank so the UI never has to
 * guard each read.
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

/** Newest sample first; records without a usable date sort to the bottom. */
export function byNewestSample(a: SoilAnalysis, b: SoilAnalysis): number {
  const left = Date.parse(a.sampleDate);
  const right = Date.parse(b.sampleDate);
  if (Number.isNaN(left) && Number.isNaN(right)) return 0;
  if (Number.isNaN(left)) return 1;
  if (Number.isNaN(right)) return -1;
  return right - left;
}
