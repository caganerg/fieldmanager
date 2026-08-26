"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Droplets, Maximize2, Plus, Trash2 } from "lucide-react";
import { t } from "@/lib/translations";
import { createId } from "@/lib/utils";
import { getPolygonArea } from "@/lib/geo";
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
import {
  IRRIGATION_METHODS,
  addDays,
  appliedDepthMm,
  createDraft,
  draftNumber,
  dueBadgeClass,
  dueStatus,
  formatArea,
  formatDecares,
  formatWater,
  methodLabel,
  summarizeField,
  todayIso,
  upcomingPlans,
  type IrrigationDraft,
  type IrrigationMethod,
} from "@/lib/irrigation";

const SELECT_CLASS =
  "w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1.5 text-zinc-800 dark:text-zinc-200 outline-none disabled:opacity-60";

// Offsets for the "next irrigation" shortcuts: roughly the intervals a drip or
// sprinkler rotation actually runs on, so the common case is one click.
const NEXT_OFFSETS = [3, 7, 14] as const;

interface IrrigationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: FieldPolygon[];
  selectedFieldId: string | null;
}

/** A labelled figure inside the summary card. */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-white/80 dark:bg-zinc-900/70 px-2 py-1.5 min-w-0">
      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{label}</div>
      <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100 truncate">{value}</div>
      {hint && <div className="text-[10px] text-zinc-400 truncate">{hint}</div>}
    </div>
  );
}

export default function IrrigationDialog({
  open,
  onOpenChange,
  fields,
  selectedFieldId,
}: IrrigationDialogProps) {
  // The records belong to the fields, so they live in the server-backed store
  // rather than in this browser.
  const { irrigationLogs: logs, setIrrigationLogs: setLogs } = useFieldData();

  const [draft, setDraft] = useState<IrrigationDraft>(() => createDraft("", 0));
  const [error, setError] = useState<string | null>(null);

  const hasFields = fields.length > 0;

  // Drawn area per field, so the form can offer the whole parcel as the default
  // and the history can say what share of it each watering covered.
  const areaByField = useMemo(() => {
    const map = new Map<string, number>();
    for (const field of fields) map.set(field.id, getPolygonArea(field.coordinates));
    return map;
  }, [fields]);

  // Each opening starts a fresh record aimed at whatever field is selected now,
  // rather than reviving whatever half-filled form was left behind last time.
  useEffect(() => {
    if (!open) return;
    const fieldId = selectedFieldId || fields[0]?.id || "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(createDraft(fieldId, areaByField.get(fieldId) ?? 0));
    setError(null);
  }, [open, selectedFieldId, fields, areaByField]);

  const summary = useMemo(() => summarizeField(logs, draft.fieldId), [logs, draft.fieldId]);
  const plans = useMemo(() => upcomingPlans(logs), [logs]);

  const fieldArea = areaByField.get(draft.fieldId) ?? 0;
  const draftArea = draftNumber(draft.area);
  // What share of the parcel this record covers. Only meaningful while the field
  // is still on the map, which is also the only time we know its size.
  const coverage = fieldArea > 0 && draftArea > 0 ? Math.round((draftArea / fieldArea) * 100) : null;

  const set = <K extends keyof IrrigationDraft>(key: K, value: IrrigationDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  // Switching fields re-aims the area at the new parcel: the number carried over
  // from the previous one describes a different piece of land.
  const chooseField = (fieldId: string) => {
    setDraft((prev) => ({
      ...prev,
      fieldId,
      area: String(Math.round(areaByField.get(fieldId) ?? 0) || ""),
    }));
    setError(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const field = fields.find((item) => item.id === draft.fieldId);
    if (!field) {
      setError(t.irrigation.needsField);
      return;
    }
    const areaSqm = draftNumber(draft.area);
    if (areaSqm <= 0) {
      setError(t.irrigation.needsArea);
      return;
    }
    // A plan that falls before the watering it follows is a typo, not a plan.
    if (draft.nextDate && draft.date && draft.nextDate < draft.date) {
      setError(t.irrigation.nextBeforeDate);
      return;
    }

    setLogs((prev) => [
      {
        id: createId(),
        fieldId: field.id,
        fieldName: field.name,
        date: draft.date,
        areaSqm,
        waterM3: draftNumber(draft.water),
        method: draft.method,
        nextDate: draft.nextDate,
      },
      ...prev,
    ]);

    // Keep the field, the method and the plan — the next entry is usually the
    // same rotation on the same parcel — but clear what was measured this time.
    setDraft((prev) => ({ ...prev, water: "" }));
    setError(null);
  };

  const lastDepth = summary.last
    ? appliedDepthMm(summary.last.waterM3, summary.last.areaSqm)
    : null;
  const nextStatus = summary.next ? dueStatus(summary.next) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
            <Droplets className="w-5 h-5" />
            {t.featureIrrigation}
          </DialogTitle>
          <DialogDescription>{t.featureIrrigationDesc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Where the chosen field stands right now, so the form opens with context */}
          {summary.last && (
            <div className="p-3 rounded-xl border border-sky-100 dark:border-sky-900/50 bg-sky-50/60 dark:bg-sky-950/30">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300">
                  {t.irrigation.lastTitle}
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                  <CalendarClock className="w-3 h-3" />
                  {summary.last.date || "—"} · {methodLabel(summary.last.method)}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat
                  label={t.irrigation.area}
                  value={formatArea(summary.last.areaSqm)}
                  hint={formatDecares(summary.last.areaSqm)}
                />
                <Stat
                  label={t.irrigation.water}
                  value={summary.last.waterM3 > 0 ? formatWater(summary.last.waterM3) : "—"}
                  hint={
                    lastDepth === null
                      ? undefined
                      : `${t.irrigation.depth} ${lastDepth.toFixed(1)} mm`
                  }
                />
                <Stat
                  label={t.irrigation.totalArea}
                  value={formatArea(summary.totalAreaSqm)}
                  hint={`${summary.logs.length} · ${formatWater(summary.totalWaterM3)}`}
                />
                <div className="rounded-lg bg-white/80 dark:bg-zinc-900/70 px-2 py-1.5 min-w-0">
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                    {t.irrigation.nextTitle}
                  </div>
                  <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100 truncate">
                    {summary.next || "—"}
                  </div>
                  {nextStatus ? (
                    <span
                      className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${dueBadgeClass(nextStatus.level)}`}
                    >
                      {nextStatus.label}
                    </span>
                  ) : (
                    <div className="text-[10px] text-zinc-400 truncate">
                      {t.irrigation.nonePlanned}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="p-3.5 bg-zinc-50/80 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3"
          >
            <h4 className="text-xs font-bold text-zinc-700 dark:text-zinc-200 uppercase tracking-wide flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              {t.irrigation.addTitle}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">{t.logField}</Label>
                <select
                  className={SELECT_CLASS}
                  value={draft.fieldId}
                  disabled={!hasFields}
                  onChange={(event) => chooseField(event.target.value)}
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
                <div className="flex items-baseline justify-between gap-2">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                    {t.irrigation.area}
                  </Label>
                  {fieldArea > 0 && (
                    <button
                      type="button"
                      onClick={() => set("area", String(Math.round(fieldArea)))}
                      className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Maximize2 className="w-3 h-3" />
                      {t.irrigation.wholeField}
                    </button>
                  )}
                </div>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  placeholder={fieldArea > 0 ? String(Math.round(fieldArea)) : "5000"}
                  value={draft.area}
                  onChange={(event) => set("area", event.target.value)}
                />
                <div className="h-4 text-[10px] text-zinc-400">
                  {draftArea > 0 &&
                    `${formatDecares(draftArea)}${coverage === null ? "" : ` · %${coverage} ${t.irrigation.areaHint}`}`}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400 flex items-baseline gap-1">
                  <span>{t.irrigation.water}</span>
                  <span className="text-[10px] text-zinc-400">{t.irrigation.waterOptional}</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  placeholder="250"
                  value={draft.water}
                  onChange={(event) => set("water", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                  {t.irrigation.method}
                </Label>
                <select
                  className={SELECT_CLASS}
                  value={draft.method}
                  onChange={(event) => set("method", event.target.value as IrrigationMethod)}
                >
                  {IRRIGATION_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {methodLabel(method)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                  {t.irrigation.date}
                </Label>
                <Input
                  type="date"
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  value={draft.date}
                  onChange={(event) => set("date", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                    {t.irrigation.nextDate}
                  </Label>
                  <span className="flex items-center gap-1">
                    {NEXT_OFFSETS.map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => set("nextDate", addDays(draft.date || todayIso(), days))}
                        className="text-[10px] px-1.5 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer"
                      >
                        +{days}
                        {t.irrigation.daysShort}
                      </button>
                    ))}
                  </span>
                </div>
                <Input
                  type="date"
                  min={draft.date || undefined}
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  value={draft.nextDate}
                  onChange={(event) => set("nextDate", event.target.value)}
                />
                <div className="h-4 text-[10px] text-zinc-400">{t.irrigation.nextDateHint}</div>
              </div>
            </div>

            <Button
              type="submit"
              size="sm"
              disabled={!hasFields}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white text-xs h-8"
            >
              {t.irrigation.save}
            </Button>
            {(error || !hasFields) && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 text-center">
                {hasFields ? error : t.irrigation.needsField}
              </p>
            )}
          </form>

          {/* What is due next across the whole farm, overdue rows first */}
          {plans.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                {t.irrigation.scheduleTitle}
              </h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {plans.map((plan) => {
                  const status = dueStatus(plan.date);
                  return (
                    <div
                      key={plan.fieldId}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-zinc-50/50 dark:bg-zinc-900/50 text-xs"
                    >
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                        {plan.fieldName}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-zinc-400">{plan.date}</span>
                        {status && (
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${dueBadgeClass(status.level)}`}
                          >
                            {status.label}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* History for the chosen field */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {t.irrigation.historyTitle}
            </h4>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {summary.logs.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800">
                  {t.irrigation.empty}
                </div>
              ) : (
                summary.logs.map((log) => {
                  const depth = appliedDepthMm(log.waterM3, log.areaSqm);
                  return (
                    <div
                      key={log.id}
                      className="group flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-zinc-50/50 dark:bg-zinc-900/50 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {log.date || "—"}
                        </span>
                        <span className="text-zinc-400 ml-2 truncate">
                          {[
                            methodLabel(log.method),
                            log.nextDate && `→ ${log.nextDate}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-medium text-sky-600 dark:text-sky-400">
                          {formatArea(log.areaSqm)}
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {log.waterM3 > 0 ? formatWater(log.waterM3) : "—"}
                          {depth !== null && (
                            <span className="text-zinc-400"> ({depth.toFixed(1)} mm)</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => setLogs((prev) => prev.filter((item) => item.id !== log.id))}
                          title={t.irrigation.delete}
                          aria-label={t.irrigation.delete}
                          className="p-1 rounded-md text-zinc-300 dark:text-zinc-600 hover:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
