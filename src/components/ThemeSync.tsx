"use client";

import { useEffect } from "react";

import { startThemeSync } from "@/lib/theme";

/**
 * Applies the theme this browser chose to `<html>` on every page.
 *
 * The settings dialog owns the *choice* — it has the three buttons — but the
 * login and users pages need the same class on the root element without
 * pulling the whole dashboard in. Mounting this in the layout is what puts it
 * on all of them; the logic itself is in `@/lib/theme`, shared with the dialog
 * so there is one answer to what the class should be.
 */
export default function ThemeSync() {
  useEffect(() => startThemeSync(), []);

  return null;
}
