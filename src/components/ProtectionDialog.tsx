"use client";

import { useEffect, useMemo, useState } from "react";
import { Bug, CalendarClock, CalendarDays, Check, Plus, Sparkles, Trash2 } from "lucide-react";

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
import {
  PROTECTION_METHODS,
  PROTECTION_STATUSES,
  agentLabel,
  agentPlaceholder,
  createDraft,
  dateLabel,
  dosePlaceholder,
  methodBadgeClass,
  methodLabel,
  splitByStatus,
  statusLabel,
  treatmentsForField,
  type ProtectionDraft,
  type ProtectionLog,
  type ProtectionMethod,
} from "@/lib/protection";

const SELECT_CLASS =
  "w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1.5 text-zinc-800 dark:text-zinc-200 outline-none disabled:opacity-60";

interface ProtectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: FieldPolygon[];
  selectedFieldId: string | null;
}

/**
 * One of the two lists. Both draw the same row — the state is what differs, and
 * only a planned treatment offers the button that carries it out.
 */
function TreatmentList({
  title,
  logs,
  empty,
  onMarkApplied,
  onDelete,
}: {
  title: string;
  logs: ProtectionLog[];
  empty: string;
  onMarkApplied?: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
        {title}
        {logs.length > 0 && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {logs.length}
          </span>
        )}
      </h4>
      <div className="space-y-1.5 max-h-56 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800">
            {empty}
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="group flex items-start justify-between gap-2 p-2.5 rounded-lg border bg-zinc-50/50 dark:bg-zinc-900/50 text-xs"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${methodBadgeClass(log.method)}`}
                  >
                    {methodLabel(log.method)}
                  </span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    {log.agent}
                  </span>
                  {log.target && <span className="text-zinc-400">→ {log.target}</span>}
                </div>
                {log.notes && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{log.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {log.dose && (
                  <span className="font-medium text-rose-600 dark:text-rose-400">{log.dose}</span>
                )}
                <span className="text-zinc-400">{log.date || "—"}</span>
                {onMarkApplied && (
                  <button
                    type="button"
                    onClick={() => onMarkApplied(log.id)}
                    title={t.protection.markApplied}
                    aria-label={t.protection.markApplied}
                    className="p-1 rounded-md text-zinc-300 dark:text-zinc-600 hover:text-emerald-600 dark:hover:text-emerald-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(log.id)}
                  title={t.protection.delete}
                  aria-label={t.protection.delete}
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
  );
}

export default function ProtectionDialog({
  open,
  onOpenChange,
  fields,
  selectedFieldId,
}: ProtectionDialogProps) {
  const { protectionLogs, setProtectionLogs } = useFieldData();
  const { openAssistant } = useAssistant();

  const [draft, setDraft] = useState<ProtectionDraft>(() => createDraft(""));
  const [error, setError] = useState<string | null>(null);

  const hasFields = fields.length > 0;

  // Each opening aims at whatever field is selected now, the way the irrigation
  // and soil dialogs do, rather than reviving the form left behind last time.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(createDraft(selectedFieldId || fields[0]?.id || ""));
    setError(null);
  }, [open, selectedFieldId, fields]);

  const { planned, applied } = useMemo(
    () => splitByStatus(treatmentsForField(protectionLogs, draft.fieldId)),
    [protectionLogs, draft.fieldId]
  );
  const last = applied[0];
  const next = planned[0];
  const biologicalCount = applied.filter((log) => log.method === "biological").length;

  const set = <K extends keyof ProtectionDraft>(key: K, value: ProtectionDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const field = fields.find((candidate) => candidate.id === draft.fieldId);
    if (!field) {
      setError(t.protection.needsField);
      return;
    }
    // A record that does not say what was applied answers nothing later, and
    // it is the one field with no sensible default.
    if (draft.agent.trim() === "") {
      setError(t.protection.needsAgent);
      return;
    }
    setProtectionLogs((prev) => [
      {
        ...draft,
        agent: draft.agent.trim(),
        target: draft.target.trim(),
        dose: draft.dose.trim(),
        notes: draft.notes.trim(),
        id: createId(),
        fieldName: field.name,
      },
      ...prev,
    ]);
    // Keep the field, the method and the state — a second treatment entered in
    // the same sitting is usually the same kind on the same parcel — and clear
    // the rest.
    setDraft((prev) => ({
      ...createDraft(prev.fieldId),
      method: prev.method,
      status: prev.status,
      date: prev.date,
    }));
    setError(null);
  };

  /**
   * Carrying out a plan changes only whether it has happened. The date is left
   * as the grower entered it rather than moved to today: it is a day they chose
   * and most plans are carried out on it, so rewriting it would lose what they
   * said in exchange for a guess.
   */
  const markApplied = (id: string) =>
    setProtectionLogs((prev) =>
      prev.map((log) => (log.id === id ? { ...log, status: "applied" as const } : log))
    );

  const removeLog = (id: string) =>
    setProtectionLogs((prev) => prev.filter((log) => log.id !== id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <Bug className="w-5 h-5" />
            {t.featurePesticide}
          </DialogTitle>
          <DialogDescription>{t.featurePesticideDesc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* The same assistant the tool bar opens, pointed at this field's
              treatments — so a question arrives with the history below it. */}
          <button
            type="button"
            onClick={() =>
              openAssistant({
                topic: "protection",
                fieldId: draft.fieldId,
                fieldName: fields.find((field) => field.id === draft.fieldId)?.name ?? "",
              })
            }
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-lg border border-violet-200 dark:border-violet-900/60 bg-violet-50/60 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950/60 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {t.assistant.ask}
          </button>

          {/* The next thing due on this field, which is the one a plan exists
              to be looked at for. */}
          {next && (
            <div className="p-3 rounded-xl border border-sky-100 dark:border-sky-900/50 bg-sky-50/60 dark:bg-sky-950/30">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5" />
                  {t.protection.nextPlanned}
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {next.date || "—"}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${methodBadgeClass(next.method)}`}
                >
                  {methodLabel(next.method)}
                </span>
                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                  {next.agent}
                </span>
                {next.target && (
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    → {next.target}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* What was last done to this field, so the form opens with context. */}
          {last && (
            <div className="p-3 rounded-xl border border-rose-100 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-950/30">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-rose-800 dark:text-rose-300">
                  {t.protection.lastTitle}
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  {last.date || "—"}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${methodBadgeClass(last.method)}`}
                >
                  {methodLabel(last.method)}
                </span>
                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                  {last.agent}
                </span>
                {last.target && (
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    → {last.target}
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>
                  {t.protection.totalTreatments}:{" "}
                  <strong className="text-zinc-700 dark:text-zinc-200">{applied.length}</strong>
                </span>
                <span>
                  {t.protection.biologicalShare}:{" "}
                  <strong className="text-zinc-700 dark:text-zinc-200">{biologicalCount}</strong>
                </span>
                <span>
                  {t.protection.plannedCount}:{" "}
                  <strong className="text-zinc-700 dark:text-zinc-200">{planned.length}</strong>
                </span>
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="p-3.5 bg-zinc-50/80 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3"
          >
            <h4 className="text-xs font-bold text-zinc-700 dark:text-zinc-200 uppercase tracking-wide flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              {t.protection.addTitle}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
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
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                  {t.protection.method}
                </Label>
                <select
                  className={SELECT_CLASS}
                  value={draft.method}
                  onChange={(event) => set("method", event.target.value as ProtectionMethod)}
                >
                  {PROTECTION_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {methodLabel(method)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                {/* The date means the day it was done or the day it is due,
                    which is what the state decides — so the label follows it. */}
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                  {dateLabel(draft.status)}
                </Label>
                <Input
                  type="date"
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  value={draft.date}
                  onChange={(event) => set("date", event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                {t.protection.status}
              </Label>
              <div className="flex gap-2">
                {PROTECTION_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => set("status", status)}
                    aria-pressed={draft.status === status}
                    className={`flex-1 text-xs py-1.5 rounded-md border transition-colors cursor-pointer ${
                      draft.status === status
                        ? "border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-300 font-medium"
                        : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    {statusLabel(status)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                {/* The label follows the method: the same answer is a product
                    name for a spray and a species for a release. */}
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                  {agentLabel(draft.method)}
                </Label>
                <Input
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  placeholder={agentPlaceholder(draft.method)}
                  value={draft.agent}
                  onChange={(event) => set("agent", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                  {t.protection.target}
                </Label>
                <Input
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  placeholder={t.protection.targetPlaceholder}
                  value={draft.target}
                  onChange={(event) => set("target", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                  {t.protection.dose}
                </Label>
                <Input
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  placeholder={dosePlaceholder(draft.method)}
                  value={draft.dose}
                  onChange={(event) => set("dose", event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                {t.protection.notes}
              </Label>
              <Input
                className="h-8 text-xs bg-white dark:bg-zinc-900"
                placeholder={t.protection.notesPlaceholder}
                value={draft.notes}
                onChange={(event) => set("notes", event.target.value)}
              />
            </div>

            <Button
              type="submit"
              size="sm"
              disabled={!hasFields}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white text-xs h-8"
            >
              {t.protection.save}
            </Button>
            {(error || !hasFields) && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 text-center">
                {hasFields ? error : t.protection.needsField}
              </p>
            )}
          </form>

          {/* The two states, each as its own list. A plan and a record of what
              was done are read for different things, and one mixed list ordered
              either way buries half of itself. */}
          <TreatmentList
            title={t.protection.plannedTitle}
            logs={planned}
            empty={t.protection.emptyPlanned}
            onMarkApplied={markApplied}
            onDelete={removeLog}
          />
          <TreatmentList
            title={t.protection.appliedTitle}
            logs={applied}
            empty={t.protection.emptyApplied}
            onDelete={removeLog}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
