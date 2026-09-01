"use client";

import { useEffect, useState } from "react";

import { Monitor, Moon, Settings, Sun } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { readStoredTheme, setTheme, type Theme } from "@/lib/theme";
import { t } from "@/lib/translations";

/**
 * Where the theme is chosen.
 *
 * The dialog holds the selection because nothing else on the dashboard reads
 * it: applying the class is `ThemeSync`'s job, on every page, and both go
 * through `@/lib/theme`. The stored value is read on mount rather than during
 * the first render so the server and the browser agree on what to draw.
 */

const OPTIONS = [
  { value: "light" as const, label: t.themeLight, icon: Sun },
  { value: "dark" as const, label: t.themeDark, icon: Moon },
  { value: "system" as const, label: t.themeSystem, icon: Monitor },
];

export default function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [theme, setThemeChoice] = useState<Theme>("system");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeChoice(readStoredTheme());
  }, []);

  const choose = (value: Theme) => {
    setThemeChoice(value);
    setTheme(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-600" />
            {t.settingsBtn}
          </DialogTitle>
          <DialogDescription>
            {t.settingsBtn}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Theme Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">{t.theme}</Label>
            <div className="grid grid-cols-3 gap-3">
              {OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => choose(option.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${theme === option.value
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-sm'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${theme === option.value
                    ? 'bg-emerald-100 dark:bg-emerald-800/40'
                    : 'bg-zinc-100 dark:bg-zinc-800'
                    }`}>
                    <option.icon className={`w-5 h-5 transition-colors ${theme === option.value
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-zinc-500 dark:text-zinc-400'
                      }`} />
                  </div>
                  <span className={`text-sm font-medium transition-colors ${theme === option.value
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-zinc-600 dark:text-zinc-400'
                    }`}>{option.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {theme === 'system'
                ? t.themeDesc
                : theme === 'dark'
                  ? t.themeDarkActive
                  : t.themeLightActive}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
