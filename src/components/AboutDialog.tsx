"use client";

import { Trees } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/lib/translations";

/** What the application is, and what it does not promise. */
export default function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trees className="w-5 h-5 text-emerald-600" />
            {t.aboutTitle}
          </DialogTitle>
          <DialogDescription>
            {t.aboutDesc}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t.aboutBody}
          </p>
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase">{t.licenseLabel}</h4>
            <p className="text-xs text-zinc-500">
              {t.licenseDesc}<br />
              {t.noWarranty}
            </p>
          </div>
          <div className="pt-4 border-t text-xs text-zinc-400 text-center">
            {t.versionLabel} 0.2.1 &bull; &copy; 2026 {t.contributorsLabel}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
