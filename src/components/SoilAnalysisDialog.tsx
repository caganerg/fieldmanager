"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Plus, Trash2, ChevronDown, FlaskConical, CalendarDays } from "lucide-react";
import { t } from "@/lib/translations";
import { createId } from "@/lib/utils";
import { type FieldPolygon } from "@/components/Map";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useFieldData } from "@/components/FieldDataProvider";
import SoilReadingTile from "@/components/SoilReadingTile";
import {
  SOIL_PARAMETERS,
  SOIL_SUMMARY_KEYS,
  SOIL_TEXTURES,
  analysesForField,
  createDraft,
  hasAnyMeasurement,
  levelBadgeClass,
  rateMeasurement,
  soilParameter,
  type SoilDraft,
  type SoilParameter,
} from "@/lib/soil";

const MACRO_PARAMETERS = SOIL_PARAMETERS.filter((parameter) => parameter.group === "macro");
const MICRO_PARAMETERS = SOIL_PARAMETERS.filter((parameter) => parameter.group === "micro");

const SELECT_CLASS =
  "w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1.5 text-zinc-800 dark:text-zinc-200 outline-none disabled:opacity-60";

interface SoilAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: FieldPolygon[];
  selectedFieldId: string | null;
}

/** One measurement input with its live interpretation. */
function MeasurementInput({
  parameter,
  value,
  onChange,
}: {
  parameter: SoilParameter;
  value: string;
  onChange: (value: string) => void;
}) {
  const rating = rateMeasurement(parameter, value);
  return (
    <div className="space-y-1">
      <Label className="text-xs text-zinc-600 dark:text-zinc-400 flex items-baseline gap-1">
        <span>{parameter.label}</span>
        {parameter.unit && <span className="text-[10px] text-zinc-400">{parameter.unit}</span>}
      </Label>
      <Input
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        className="h-8 text-xs bg-white dark:bg-zinc-900"
        placeholder={parameter.placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {/* Reserve the row so typing a value doesn't shift the grid below it. */}
      <div className="h-4 flex items-center">
        {rating ? (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${levelBadgeClass(rating.level)}`}>
            {rating.label}
          </span>
        ) : (
          parameter.hint && <span className="text-[10px] text-zinc-400">{parameter.hint}</span>
        )}
      </div>
    </div>
  );
}

/** A measured value plus its band, as shown when a past record is expanded. */
function MeasurementReadout({
  parameter,
  value,
}: {
  parameter: SoilParameter;
  value: string;
}) {
  const rating = rateMeasurement(parameter, value);
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{parameter.label}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          {rating ? `${value}${parameter.unit ? ` ${parameter.unit}` : ""}` : "—"}
        </span>
        {rating && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${levelBadgeClass(rating.level)}`}>
            {rating.label}
          </span>
        )}
      </span>
    </div>
  );
}

export default function SoilAnalysisDialog({
  open,
  onOpenChange,
  fields,
  selectedFieldId,
}: SoilAnalysisDialogProps) {
  // Analyses belong to the fields, so they live in the server-backed store.
  const { soilAnalyses: analyses, setSoilAnalyses: setAnalyses } = useFieldData();

  const [draft, setDraft] = useState<SoilDraft>(() => createDraft(""));
  const [showMicro, setShowMicro] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasFields = fields.length > 0;

  // Each opening starts a fresh report aimed at whatever field is selected now,
  // rather than reviving whatever half-filled form was left behind last time.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(createDraft(selectedFieldId || fields[0]?.id || ""));
    setShowMicro(false);
    setExpandedId(null);
    setError(null);
  }, [open, selectedFieldId, fields]);

  const fieldAnalyses = useMemo(
    () => analysesForField(analyses, draft.fieldId),
    [analyses, draft.fieldId]
  );
  const latest = fieldAnalyses[0];

  const set = <K extends keyof SoilDraft>(key: K, value: SoilDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const field = fields.find((f) => f.id === draft.fieldId);
    if (!field) {
      setError(t.soil.needsField);
      return;
    }
    // A report with no readings is not a report; saving it would only clutter
    // the history with an empty row.
    if (!hasAnyMeasurement(draft)) {
      setError(t.soil.needsValue);
      return;
    }
    setAnalyses((prev) => [
      { ...draft, id: createId(), fieldName: field.name },
      ...prev,
    ]);
    // Keep the field and sampling metadata so a second report from the same
    // visit is quick to enter, but clear the readings.
    setDraft((prev) => ({
      ...createDraft(prev.fieldId),
      sampleDate: prev.sampleDate,
      depth: prev.depth,
      lab: prev.lab,
    }));
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Activity className="w-5 h-5" />
            {t.featureSoilAnalysis}
          </DialogTitle>
          <DialogDescription>{t.featureSoilAnalysisDesc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Latest reading for the chosen field, so the form opens with context */}
          {latest && (
            <div className="p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/30">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                  {t.soil.latestTitle}
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  {latest.sampleDate || "—"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SOIL_SUMMARY_KEYS.map((key) => (
                  <SoilReadingTile key={key} measurementKey={key} value={latest[key]} />
                ))}
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="p-3.5 bg-zinc-50/80 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3"
          >
            <h4 className="text-xs font-bold text-zinc-700 dark:text-zinc-200 uppercase tracking-wide flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              {t.soil.addTitle}
            </h4>

            {/* Sample metadata */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">{t.logField}</Label>
                <select
                  className={SELECT_CLASS}
                  value={draft.fieldId}
                  disabled={!hasFields}
                  onChange={(event) => set("fieldId", event.target.value)}
                >
                  {hasFields ? (
                    fields.map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.name}
                      </option>
                    ))
                  ) : (
                    <option value="">{t.logNoFields}</option>
                  )}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">{t.soil.sampleDate}</Label>
                <Input
                  type="date"
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  value={draft.sampleDate}
                  onChange={(event) => set("sampleDate", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">{t.soil.depth}</Label>
                <Input
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  placeholder="0-30"
                  value={draft.depth}
                  onChange={(event) => set("depth", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">{t.soil.texture}</Label>
                <select
                  className={SELECT_CLASS}
                  value={draft.texture}
                  onChange={(event) => set("texture", event.target.value)}
                >
                  <option value="">{t.soil.textureUnknown}</option>
                  {SOIL_TEXTURES.map((texture) => (
                    <option key={texture} value={texture}>
                      {texture}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Main readings */}
            <div className="pt-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {t.soil.macroTitle}
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 mt-1.5">
                {MACRO_PARAMETERS.map((parameter) => (
                  <MeasurementInput
                    key={parameter.key}
                    parameter={parameter}
                    value={draft[parameter.key]}
                    onChange={(value) => set(parameter.key, value)}
                  />
                ))}
              </div>
            </div>

            {/* Micronutrients, folded away because many reports omit them */}
            <div>
              <button
                type="button"
                onClick={() => setShowMicro((shown) => !shown)}
                aria-expanded={showMicro}
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                {t.soil.micronutrients}
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${showMicro ? "rotate-180" : ""}`}
                />
              </button>
              {showMicro && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 mt-2">
                  {MICRO_PARAMETERS.map((parameter) => (
                    <MeasurementInput
                      key={parameter.key}
                      parameter={parameter}
                      value={draft[parameter.key]}
                      onChange={(value) => set(parameter.key, value)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">{t.soil.lab}</Label>
                <Input
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  placeholder={t.soil.labPlaceholder}
                  value={draft.lab}
                  onChange={(event) => set("lab", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">{t.soil.notes}</Label>
                <Input
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  placeholder={t.soil.notesPlaceholder}
                  value={draft.notes}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </div>
            </div>

            <Button
              type="submit"
              size="sm"
              disabled={!hasFields}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
            >
              {t.soil.save}
            </Button>
            {(error || !hasFields) && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 text-center">
                {hasFields ? error : t.soil.needsField}
              </p>
            )}
          </form>

          {/* History for the chosen field */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {t.soil.historyTitle}
            </h4>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {fieldAnalyses.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800">
                  {t.soil.empty}
                </div>
              ) : (
                fieldAnalyses.map((analysis) => {
                  const isExpanded = expandedId === analysis.id;
                  return (
                    <div
                      key={analysis.id}
                      className="rounded-lg border bg-zinc-50/50 dark:bg-zinc-900/50 overflow-hidden"
                    >
                      <div className="group flex items-center justify-between gap-2 p-2.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : analysis.id)}
                          aria-expanded={isExpanded}
                          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                          />
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                            {analysis.sampleDate || "—"}
                          </span>
                          <span className="text-zinc-400 truncate">
                            {[analysis.depth && `${analysis.depth} cm`, analysis.texture, analysis.lab]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </button>
                        <span className="flex items-center gap-2 shrink-0">
                          {SOIL_SUMMARY_KEYS.slice(0, 2).map((key) => {
                            const parameter = soilParameter(key);
                            const rating = rateMeasurement(parameter, analysis[key]);
                            if (!rating) return null;
                            return (
                              <span key={key} className="text-zinc-500 dark:text-zinc-400">
                                {parameter.label} <strong className="text-zinc-700 dark:text-zinc-200">{analysis[key]}</strong>
                              </span>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() =>
                              setAnalyses((prev) => prev.filter((item) => item.id !== analysis.id))
                            }
                            title={t.soil.delete}
                            aria-label={t.soil.delete}
                            className="p-1 rounded-md text-zinc-300 dark:text-zinc-600 hover:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      </div>

                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                            {SOIL_PARAMETERS.map((parameter) => (
                              <MeasurementReadout
                                key={parameter.key}
                                parameter={parameter}
                                value={analysis[parameter.key]}
                              />
                            ))}
                          </div>
                          {analysis.notes && (
                            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                              {analysis.notes}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
