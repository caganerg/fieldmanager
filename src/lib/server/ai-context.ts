import { getPolygonArea } from "@/lib/geo";
import {
  SOIL_PARAMETERS,
  byNewestSample,
  rateMeasurement,
  type SoilAnalysis,
} from "@/lib/soil";
import { byNewestIrrigation, methodLabel } from "@/lib/irrigation";
import { readDocument } from "@/lib/server/data-store";
import type { AssistantTopic } from "@/lib/ai";
import type { FertilizerLog, StoredDocument, StoredField } from "@/lib/field-data";

/**
 * What the model is allowed to see, and how it reads.
 *
 * The browser sends a topic and a field id, never data — so this is the only
 * place that decides what goes in front of the model, and a client cannot widen
 * it. The topic is what narrows it: a fertilisation question gets the
 * applications and the analysis they should have been chosen against, a soil
 * question gets the reports in full, and a general one gets a register of the
 * farm without any of the record detail.
 *
 * Everything is rendered as plain lines rather than JSON. It reads better to a
 * model, and it costs fewer tokens per fact — which matters here because every
 * one of these lines is billed on every turn of the conversation.
 */

// Ceilings on what one question can drag in. A farm with four hundred fields
// would otherwise put its whole history in the prompt, at the operator's cost,
// on a question about one parcel.
const MAX_FIELDS_LISTED = 60;
const MAX_ANALYSES_PER_FIELD = 4;
const MAX_FERTILIZER_LOGS = 20;
const MAX_IRRIGATION_LOGS = 8;

const LOCALE = "tr-TR";

function decares(field: StoredField): string {
  const sqm = getPolygonArea(field.coordinates);
  return `${(sqm / 1000).toLocaleString(LOCALE, { maximumFractionDigits: 2 })} da`;
}

function describeField(field: StoredField, groupName: string): string {
  const parts = [`${field.name} (${decares(field)})`];
  if (field.cropType) parts.push(`crop: ${field.cropType}`);
  if (groupName) parts.push(`group: ${groupName}`);
  if (field.plantDate) parts.push(`planted: ${field.plantDate.slice(0, 10)}`);
  if (field.harvestDate) parts.push(`harvest: ${field.harvestDate.slice(0, 10)}`);
  return `- ${parts.join(", ")}`;
}

/**
 * One report, with every measurement it carries and the band that measurement
 * falls in. The band is the part worth spending tokens on: "0.12 %" alone
 * invites the model to invent a threshold, while "0.12 % (Medium)" hands it the
 * interpretation the rest of the app already shows the user, so the answer and
 * the screen cannot disagree.
 */
function describeAnalysis(analysis: SoilAnalysis): string {
  const readings = SOIL_PARAMETERS.map((parameter) => {
    const rating = rateMeasurement(parameter, analysis[parameter.key]);
    if (!rating) return null;
    const unit = parameter.unit ? ` ${parameter.unit}` : "";
    return `${parameter.label} ${analysis[parameter.key]}${unit} (${rating.label})`;
  }).filter((line): line is string => line !== null);

  const header = [
    analysis.sampleDate || "undated",
    analysis.depth && `${analysis.depth} cm`,
    analysis.texture,
    analysis.lab,
  ]
    .filter(Boolean)
    .join(" · ");

  const lines = [`- ${header}`];
  lines.push(readings.length > 0 ? `  ${readings.join("; ")}` : "  no measurements recorded");
  if (analysis.notes) lines.push(`  note: ${analysis.notes}`);
  return lines.join("\n");
}

function describeFertilizerLog(log: FertilizerLog): string {
  return `- ${log.date || "undated"}: ${log.type || "unspecified"}, ${log.amount || "amount not recorded"}${
    log.fieldName ? ` — ${log.fieldName}` : ""
  }`;
}

function section(title: string, lines: string[], emptyNote: string): string {
  return `${title}\n${lines.length > 0 ? lines.join("\n") : emptyNote}`;
}

/**
 * Fertilisation records are the one slice still keyed by field *name* rather
 * than by id, so a rename orphans them. Matching on the name is what the module
 * itself does when it writes them; when no field is selected the whole log is
 * used, which is also what the dialog shows.
 */
function fertilizerLogsFor(document: StoredDocument, field: StoredField | undefined) {
  const logs = field
    ? document.fertilizerLogs.filter((log) => log.fieldName === field.name)
    : document.fertilizerLogs;
  return logs.slice(0, MAX_FERTILIZER_LOGS);
}

function analysesFor(document: StoredDocument, field: StoredField | undefined): SoilAnalysis[] {
  const analyses = field
    ? document.soilAnalyses.filter((analysis) => analysis.fieldId === field.id)
    : document.soilAnalyses;
  return [...analyses].sort(byNewestSample).slice(0, MAX_ANALYSES_PER_FIELD);
}

function fieldRegister(document: StoredDocument): string[] {
  const groupNames = new Map(document.groups.map((group) => [group.id, group.name]));
  return document.fields
    .slice(0, MAX_FIELDS_LISTED)
    .map((field) => describeField(field, field.groupId ? groupNames.get(field.groupId) || "" : ""));
}

/**
 * The instructions that do not change with the topic.
 *
 * The language rule is the load-bearing one: the interface is in English but
 * the farm is not, and an answer in the wrong language is useless however
 * correct it is. The rest is about not letting the model fill gaps — a farmer
 * acting on an invented phosphorus reading is the failure mode worth designing
 * against, and "not measured" is a real and useful answer here.
 */
const HOUSE_RULES = [
  "You are the assistant inside Field Manager, a farm record-keeping application.",
  "Everything under RECORDS below comes from this farm's own saved data. Answer from it.",
  "Reply in the same language the question is written in.",
  "Never invent a measurement, a date or an application. If the records do not contain something, say that it is not recorded and, where it would settle the question, say which measurement would.",
  "Be concise: a few sentences, or a short list. This is a chat panel, not a report.",
  "Advice about dosage or timing is guidance for the farmer to weigh, not a prescription. Do not present it as certain.",
].join("\n");

const TOPIC_RULES: Record<AssistantTopic, string> = {
  general:
    "The question is a general one about the farm. The field register is below; if answering needs a specific field's analyses or applications, say which field you would need to look at.",
  fertilizer:
    "The question is about fertilisation. Read the applications already made together with the latest soil analysis: the analysis says what the soil holds, the log says what has been added to it, and a recommendation has to account for both.",
  soil: "The question is about soil analysis. The reports below carry each measurement with the band it falls in, using the classification the application itself displays.",
};

/**
 * Builds the system prompt for one question.
 *
 * Reads the document itself rather than taking it from the request — the point
 * of the whole arrangement being that a client cannot choose what the model is
 * told about the farm.
 */
export async function buildSystemPrompt(
  topic: AssistantTopic,
  fieldId: string
): Promise<string> {
  const document = await readDocument();
  const field = fieldId ? document.fields.find((candidate) => candidate.id === fieldId) : undefined;

  const blocks: string[] = [HOUSE_RULES, TOPIC_RULES[topic]];

  const scope = field
    ? `The question is about the field "${field.name}" (${decares(field)}${
        field.cropType ? `, crop: ${field.cropType}` : ""
      }).`
    : "No single field is selected, so the question covers the whole farm.";
  blocks.push(`SCOPE\n${scope}`);

  const records: string[] = [];

  if (topic === "general" || !field) {
    records.push(
      section(
        `FIELDS (${document.fields.length} total)`,
        fieldRegister(document),
        "No fields have been drawn yet."
      )
    );
  }

  if (topic === "soil" || topic === "fertilizer") {
    const analyses = analysesFor(document, field);
    records.push(
      section(
        topic === "fertilizer" ? "SOIL ANALYSIS (most recent first)" : "SOIL ANALYSES (most recent first)",
        analyses.map(describeAnalysis),
        "No soil analysis has been recorded for this scope."
      )
    );
  }

  if (topic === "fertilizer") {
    records.push(
      section(
        "FERTILIZATION APPLIED (most recent first)",
        fertilizerLogsFor(document, field).map(describeFertilizerLog),
        "No fertilization has been recorded for this scope."
      )
    );

    // Water moves nutrients and leaches them, so the recent watering is context
    // for a dosage question even though nobody asked about irrigation.
    const irrigation = (
      field
        ? document.irrigationLogs.filter((log) => log.fieldId === field.id)
        : document.irrigationLogs
    )
      .sort(byNewestIrrigation)
      .slice(0, MAX_IRRIGATION_LOGS)
      .map(
        (log) =>
          `- ${log.date || "undated"}: ${methodLabel(log.method)}${
            log.waterM3 > 0 ? `, ${log.waterM3} m³` : ""
          }`
      );
    records.push(section("RECENT IRRIGATION", irrigation, "No irrigation has been recorded."));
  }

  if (topic === "general") {
    records.push(
      `RECORD COUNTS\n- soil analyses: ${document.soilAnalyses.length}\n- fertilization records: ${document.fertilizerLogs.length}\n- irrigation records: ${document.irrigationLogs.length}`
    );
  }

  blocks.push(`RECORDS\n\n${records.join("\n\n")}`);
  return blocks.join("\n\n");
}
