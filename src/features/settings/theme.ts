// Theme preference for this device: "system" follows the OS, "light"/"dark" force it through
// <html data-theme> (see src/ui/tokens.css). Applied once at startup from main.tsx.
export type ThemePref = "system" | "light" | "dark";

const KEY = "solis.theme";

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* storage blocked: the choice lasts for this tab */
  }
  applyTheme(pref);
}

export function applyStoredTheme() {
  applyTheme(getThemePref());
}
