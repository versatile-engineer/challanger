// Yengil i18n — tashqi kutubxonasiz. `t(key)` tarjimani qaytaradi,
// `useT()` til o'zgarganda komponentni qayta render qiladi.
//
// Yangi matn qo'shish: kalitni ikkala lug'atga ham yozing va komponentda `t("key")` ishlating.
// Yangi til qo'shish: `Lang` ga qo'shing va `dict` ga to'liq lug'at bering.

import { useEffect, useReducer } from "react";

export type Lang = "uz" | "en";

export const LANG_LABELS: Record<Lang, string> = {
  uz: "O'zbekcha",
  en: "English",
};

const LANG_KEY = "challanger_lang";

function initialLang(): Lang {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "uz" || saved === "en") return saved;
  return "uz";
}

let current: Lang = initialLang();
document.documentElement.lang = current;
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang;
  listeners.forEach((fn) => fn());
}

type Dict = Record<string, string>;

const uz: Dict = {
  // Navigatsiya
  "nav.today": "Bugun",
  "nav.upcoming": "Kelgusi",
  "nav.all": "Barchasi",
  "nav.tools": "Vositalar",
  "nav.projects": "Loyihalar",
  "nav.calendar": "Kalendar",
  "nav.eisenhower": "Eisenhower",
  "nav.habits": "Odatlar",
  "nav.groups": "Jamoa",
  "nav.stats": "Statistika",
  "nav.pomodoro": "Pomodoro",
  "nav.countdown": "Sanoq (countdown)",
  "nav.settings": "Sozlamalar",
  "nav.newProject": "+ Yangi loyiha",
  "nav.logout": "Chiqish",
  "nav.delete": "O'chirish",
  // Asosiy ko'rinish
  "main.today": "Bugun",
  "main.upcoming": "Kelgusi",
  "main.all": "Barcha vazifalar",
  "main.project": "Loyiha",
  "main.search": "🔍 Qidirish…",
  "main.sortSmart": "↕ Aqlli",
  "main.sortManual": "⠿ Qo'lda",
  "main.showCompleted": "Bajarilganlar",
  "main.empty": "Vazifa yo'q 🎉",
  "main.quickAdd": "+ Vazifa… masalan: ertaga soat 15:00 hisobot !2 #ish",
  "main.filter": "Filtr:",
  "main.clearFilter": "× tozalash",
  "main.undoDeleted": "o'chirildi",
  "main.undo": "↶ Bekor qilish",
  // Sozlamalar
  "settings.title": "Sozlamalar",
  "settings.language": "Til",
};

const en: Dict = {
  // Navigation
  "nav.today": "Today",
  "nav.upcoming": "Upcoming",
  "nav.all": "All",
  "nav.tools": "Tools",
  "nav.projects": "Projects",
  "nav.calendar": "Calendar",
  "nav.eisenhower": "Eisenhower",
  "nav.habits": "Habits",
  "nav.groups": "Groups",
  "nav.stats": "Statistics",
  "nav.pomodoro": "Pomodoro",
  "nav.countdown": "Countdown",
  "nav.settings": "Settings",
  "nav.newProject": "+ New project",
  "nav.logout": "Log out",
  "nav.delete": "Delete",
  // Main view
  "main.today": "Today",
  "main.upcoming": "Upcoming",
  "main.all": "All tasks",
  "main.project": "Project",
  "main.search": "🔍 Search…",
  "main.sortSmart": "↕ Smart",
  "main.sortManual": "⠿ Manual",
  "main.showCompleted": "Completed",
  "main.empty": "No tasks 🎉",
  "main.quickAdd": "+ Task… e.g. tomorrow 3pm report !2 #work",
  "main.filter": "Filter:",
  "main.clearFilter": "× clear",
  "main.undoDeleted": "deleted",
  "main.undo": "↶ Undo",
  // Settings
  "settings.title": "Settings",
  "settings.language": "Language",
};

const dict: Record<Lang, Dict> = { uz, en };

export function t(key: string): string {
  return dict[current][key] ?? uz[key] ?? key;
}

/// Komponentni joriy tilga obuna qiladi va `t` funksiyasini qaytaradi.
export function useT(): typeof t {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    const fn = () => force();
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return t;
}
