// Mavzu boshqaruvi: 'system' | 'light' | 'dark' | 'gruvbox'
export type Theme = "system" | "light" | "dark" | "gruvbox";

const KEY = "challanger_theme";

export function getTheme(): Theme {
  const t = localStorage.getItem(KEY);
  return t === "light" || t === "dark" || t === "gruvbox" ? t : "system";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

export function setTheme(theme: Theme) {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}
