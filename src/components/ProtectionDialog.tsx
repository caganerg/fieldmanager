"use client";

import { useEffect, useMemo, useState } from "react";
import { Bug, CalendarDays, Plus, Sparkles, Trash2 } from "lucide-react";

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
  agentLabel,
  agentPlaceholder,
  createDraft,
  dosePlaceholder,
  methodBadgeClass,
  methodLabel,
  treatmentsForField,
  type ProtectionDraft,
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

  const history = useMemo(
    () => treatmentsForField(protectionLogs, draft.fieldId),
    [protectionLogs, draft.fieldId]
  );
  const last = history[0];
  const biologicalCount = history.filter((log) => log.method === "biological").length;

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
    // Keep the field and the method — a second treatment entered in the same
    // sitting is usually the same kind on the same parcel — and clear the rest.
    setDraft((prev) => ({ ...createDraft(prev.fieldId), method: prev.method, date: prev.date }));
    setError(null);
  };

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
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>
                  {t.protection.totalTreatments}:{" "}
                  <strong className="text-zinc-700 dark:text-zinc-200">{history.length}</strong>
                </span>
                <span>
                  {t.protection.biologicalShare}:{" "}
                  <strong className="text-zinc-700 dark:text-zinc-200">{biologicalCount}</strong>
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
                <Label className="text-xs text-zinc-600 dark:text-zinc-400">
                  {t.protection.date}
                </Label>
                <Input
                  type="date"
                  className="h-8 text-xs bg-white dark:bg-zinc-900"
                  value={draft.date}
                  onChange={(event) => set("date", event.target.value)}
                />
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

          {/* History for the chosen field. */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {t.protection.historyTitle}
            </h4>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {history.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800">
                  {t.protection.empty}
                </div>
              ) : (
                history.map((log) => (
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
                        <span className="font-medium text-rose-600 dark:text-rose-400">
                          {log.dose}
                        </span>
                      )}
                      <span className="text-zinc-400">{log.date || "—"}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setProtectionLogs((prev) => prev.filter((item) => item.id !== log.id))
                        }
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
