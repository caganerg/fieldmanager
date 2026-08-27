"use client";

import Link from "next/link";
import { Lock, LogIn, Trees } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { t } from "@/lib/translations";

/**
 * What the app looks like before anybody signs in.
 *
 * A guest is not a stripped-down workspace: it is a browser that has asked the
 * server for nothing. Rendering the dashboard shell with empty panels would
 * suggest the workspace is empty rather than closed, so the guest gets its own
 * screen and the dashboard is never mounted.
 */
export default function GuestScreen() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
            <Trees className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Field Manager</p>
            <p className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <Lock className="h-3 w-3" />
              {t.guestTitle}
            </p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{t.guestDesc}</p>

        <Link href="/login" className={buttonVariants({ size: "lg", className: "mt-6 w-full" })}>
          <LogIn className="h-4 w-4" />
          {t.signInBtn}
        </Link>

        <p className="mt-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {t.guestHint}
        </p>
      </div>
    </div>
  );
}
