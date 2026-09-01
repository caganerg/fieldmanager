"use client";

import { useEffect, useState } from "react";

import { Trees } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/lib/translations";

/**
 * The greeting a browser gets once.
 *
 * It decides for itself whether to open, so the flag that says it has been
 * seen is written and read in one file rather than at the three points on the
 * dashboard that used to touch it. Like the theme, the flag describes this
 * browser and not the workspace, so it stays in localStorage.
 */

const STORAGE_KEY = "fieldmanager-welcomed";

export default function WelcomeDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      // A browser that refuses storage is greeted every time rather than never.
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Nothing to remember it with; it comes back on the next visit.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600">
            <Trees className="w-6 h-6" />
            {t.welcomeTitle}
          </DialogTitle>
          <DialogDescription className="text-sm pt-2">
            {t.welcomeSubtitle}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2 text-sm text-zinc-600 dark:text-zinc-300">
          <p>
            <strong>{t.howToUse}</strong>
            <br/>
            {t.howToUseDesc}
          </p>
          <p>
            <strong>{t.weatherFeature}</strong>
            <br/>
            {t.weatherDesc}
          </p>
          <Button
            className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={dismiss}
          >
            {t.startBtn}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
