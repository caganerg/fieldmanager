"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, FlaskConical, Plus, Sparkles, Trash2 } from "lucide-react";
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
import { useAssistant } from "@/components/AssistantProvider";
import SoilReadingTile from "@/components/SoilReadingTile";
import {
  SOIL_INORGANIC_KEYS,
  SOIL_ORGANIC_KEYS,
  analysesForField,
  measuredKeys,
} from "@/lib/soil";

const SELECT_CLASS =
  "w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1.5 text-zinc-800 dark:text-zinc-200 outline-none disabled:opacity-60";

// Product names, not translated copy: a bag of DAP is labelled 18-46-0
// wherever it is sold, and the grades are what the dosage is read against.
const FERTILIZER_TYPES = [
  "Urea (46% N)",
  "DAP (18-46-0)",
  "NPK 15-15-15",
  "Ammonium Sulfate",
  "Potassium Nitrate",
  "Liquid / Foliar Fertilizer",
];

interface FertilizerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: FieldPolygon[];
  selectedFieldId: string | null;
}

export default function FertilizerDialog({
  open,
  onOpenChange,
  fields,
  selectedFieldId,
}: FertilizerDialogProps) {
  // Both the records and the analyses they are read against are field data, so
  // they come from the server-backed store rather than from this browser.
  const { fertilizerLogs, setFertilizerLogs, soilAnalyses } = useFieldData();
  const { openAssistant } = useAssistant();

  const [draft, setDraft] = useState({
    fieldId: "",
    type: FERTILIZER_TYPES[0],
    amount: "15",
    date: new Date().toISOString().split("T")[0],
  });

  const hasFields = fields.length > 0;

  // Point the form at whatever field is selected now. It used to keep the id
  // captured when the tool bar first mounted, so opening the dialog after
  // picking a different field still showed the old one.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft((prev) => ({ ...prev, fieldId: selectedFieldId || fields[0]?.id || "" }));
  }, [open, selectedFieldId, fields]);

  // The report that describes the soil the fertiliser is going onto. Only the
  // newest one counts — an older sample was superseded by it.
  const latestAnalysis = useMemo(
    () => analysesForField(soilAnalyses, draft.fieldId)[0],
    [soilAnalyses, draft.fieldId]
  );

  const organicKeys = latestAnalysis ? measuredKeys(latestAnalysis, SOIL_ORGANIC_KEYS) : [];
  const inorganicKeys = latestAnalysis ? measuredKeys(latestAnalysis, SOIL_INORGANIC_KEYS) : [];

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const field = fields.find((f) => f.id === draft.fieldId) || fields[0];
    if (!field) return;
    setFertilizerLogs((prev) => [
      {
        id: createId(),
        fieldName: field.name,
        date: draft.date,
        type: draft.type,
        amount: `${draft.amount} kg/da`,
      },
      ...prev,
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <FlaskConical className="w-5 h-5" />
            {t.featureFertilizer}
          </DialogTitle>
          <DialogDescription>{t.featureFertilizerDesc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* The same assistant the tool bar opens, pointed at this field and
              this topic — so the question arrives with the readings below it
              already in front of the model. */}
          <button
            type="button"
            onClick={() =>
              openAssistant({
                topic: "fertilizer",
                fieldId: draft.fieldId,
                fieldName: fields.find((field) => field.id === draft.fieldId)?.name ?? "",
              })
            }
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-lg border border-violet-200 dark:border-violet-900/60 bg-violet-50/60 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950/60 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {t.assistant.ask}
          </button>

          {/* What the soil already holds. A dosage picked without it is a guess,
              so it sits above the form rather than behind the soil module. */}
          <div className="p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/30">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                {t.fertilizer.soilTitle}
              </span>
              {latestAnalysis && (
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  {latestAnalysis.sampleDate || "—"}
                </span>
              )}
            </div>

            {!latestAnalysis ? (
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                {t.fertilizer.soilEmpty}
              </p>
            ) : organicKeys.length === 0 && inorganicKeys.length === 0 ? (
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                {t.fertilizer.soilNoReadings}
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {organicKeys.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/80 dark:text-emerald-400/80">
                      {t.fertilizer.soilOrganic}
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                      {organicKeys.map((key) => (
                        <SoilReadingTile
                          key={key}
                          measurementKey={key}
                          value={latestAnalysis[key]}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {inorganicKeys.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/80 dark:text-emerald-400/80">
                      {t.fertilizer.soilInorganic}
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                      {inorganicKeys.map((key) => (
                        <SoilReadingTile
                          key={key}
                          measurementKey={key}
                          value={latestAnalysis[key]}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="p-3.5 bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-100 dark:border-amber-900/50 space-y-3"
          >
            <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              {t.fertilizer.addTitle}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">{t.logField}</Label>
                <select
                  className={SELECT_CLASS}
                  value={draft.fieldId}
                  disabled={!hasFields}
                  onChange={(event) => setDraft({ ...draft, fieldId: event.target.value })}
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
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                  {t.fertilizer.dosage}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  placeholder="15"
                  value={draft.amount}
                  onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                  {t.fertilizer.type}
                </Label>
                <select
                  className={SELECT_CLASS}
                  value={draft.type}
                  onChange={(event) => setDraft({ ...draft, type: event.target.value })}
                >
                  {FERTILIZER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                  {t.fertilizer.date}
                </Label>
                <Input
                  type="date"
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  value={draft.date}
                  onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                />
              </div>
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={!hasFields}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs h-8"
            >
              {t.fertilizer.save}
            </Button>
            {!hasFields && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 text-center">
                {t.fertilizer.needsField}
              </p>
            )}
          </form>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {t.fertilizer.historyTitle}
            </h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {fertilizerLogs.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800">
                  {t.fertilizer.empty}
                </div>
              ) : (
                fertilizerLogs.map((log) => (
                  <div
                    key={log.id}
                    className="group flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-zinc-50/50 dark:bg-zinc-900/50 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {log.fieldName}
                      </span>
                      <span className="text-zinc-400 ml-2">({log.type})</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {log.amount}
                      </span>
                      <span className="text-zinc-400">{log.date}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setFertilizerLogs((prev) => prev.filter((l) => l.id !== log.id))
                        }
                        title={t.fertilizer.delete}
                        aria-label={t.fertilizer.delete}
                        className="p-1 rounded-md text-zinc-300 dark:text-zinc-600 hover:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
