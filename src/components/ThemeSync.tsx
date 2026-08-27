"use client";

import { useEffect } from "react";

/**
 * Applies the theme this browser chose to `<html>` on every page.
 *
 * The dashboard owns the theme *setting* — it has the radio buttons and it
 * writes `fieldmanager-theme` — but the login and users pages need the same
 * class on the root element without pulling the whole dashboard in. Reading
 * localStorage here rather than in each page keeps that one line of logic in
 * one place; the value describes this browser, so it stays out of the server
 * document.
 */
export default function ThemeSync() {
  useEffect(() => {
    const apply = () => {
      let theme: string | null = null;
      try {
        theme = localStorage.getItem("fieldmanager-theme");
      } catch {
        // A browser that refuses storage simply follows the system setting.
      }
      const dark =
        theme === "dark" ||
        (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    };

    apply();
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, []);

  return null;
}
