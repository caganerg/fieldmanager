"use client";

import { Redo2, Undo2 } from "lucide-react";

import { useFieldData } from "@/components/FieldDataProvider";
import { t } from "@/lib/translations";

/**
 * Steps the whole farm document back and forth — the way out of a field
 * deleted by accident.
 *
 * The stack itself belongs to `FieldDataProvider`, which owns the document and
 * also listens for Ctrl+Z; this is only the pair of buttons for it, so the
 * gesture is discoverable by somebody who would never guess the shortcut.
 *
 * Nothing is drawn for a read-only account: a step it took could not be saved.
 */
export default function HistoryControls() {
  const { canEdit, canUndo, canRedo, undo, redo } = useFieldData();

  if (!canEdit) return null;

  const buttonClass =
    "flex items-center justify-center w-8 h-8 transition-colors text-zinc-600 dark:text-zinc-300 " +
    "enabled:cursor-pointer enabled:hover:bg-zinc-50 dark:enabled:hover:bg-zinc-800/80 " +
    "enabled:hover:text-emerald-600 dark:enabled:hover:text-emerald-400 " +
    "disabled:text-zinc-300 dark:disabled:text-zinc-700 disabled:cursor-not-allowed";

  return (
    <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs divide-x divide-zinc-200 dark:divide-zinc-800">
      <button
        type="button"
        onClick={undo}
        disabled={!canUndo}
        title={canUndo ? t.undoTitle : t.undoNothing}
        aria-label={t.undoBtn}
        className={`${buttonClass} rounded-l-lg`}
      >
        <Undo2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={!canRedo}
        title={canRedo ? t.redoTitle : t.redoNothing}
        aria-label={t.redoBtn}
        className={`${buttonClass} rounded-r-lg`}
      >
        <Redo2 className="w-4 h-4" />
      </button>
    </div>
  );
}
