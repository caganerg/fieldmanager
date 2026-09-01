/**
 * Which theme this browser is set to, and the one place that acts on it.
 *
 * The value describes the browser rather than the workspace, so it stays in
 * localStorage and out of the server document — the same rule the pinned tools
 * and the welcome flag follow.
 *
 * Two things care about it: `ThemeSync`, mounted in the layout so every page
 * gets the class on `<html>`, and the settings dialog, which is where the
 * choice is made. They used to hold a copy each — two `matchMedia` listeners
 * and two versions of "does this mean dark" on the same page. The choice lives
 * here now, in a module variable, so a change made in the dialog is the value
 * the system-preference listener will read the next time the operating system
 * flips.
 */

export const THEME_STORAGE_KEY = "fieldmanager-theme";

export type Theme = "light" | "dark" | "system";

/** What "system" resolves to right now. */
function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

let current: Theme = "system";

export function readStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // A browser that refuses storage simply follows the system setting.
  }
  return "system";
}

function apply() {
  const dark = current === "dark" || (current === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

/** Records a choice and shows it immediately. */
export function setTheme(theme: Theme) {
  current = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Nothing to remember it with; the page still changes for this visit.
  }
  apply();
}

/**
 * Applies the stored choice and keeps following the system while it is set to
 * "system". Returns the teardown, so an effect can hand it straight back.
 */
export function startThemeSync(): () => void {
  current = readStoredTheme();
  apply();
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", apply);
  return () => mediaQuery.removeEventListener("change", apply);
}
