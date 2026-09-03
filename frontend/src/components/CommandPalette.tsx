import { useEffect, useMemo, useRef, useState } from "react";
import type { Habit, Project, Task } from "../types";
import type { Page, Selection } from "./Sidebar";

interface Item {
  kind: "task" | "habit" | "project" | "page";
  id: string;
  label: string;
  hint: string;
  icon: string;
  action: () => void;
}

interface Props {
  tasks: Task[];
  habits: Habit[];
  projects: Project[];
  onSelectTask: (id: string) => void;
  onSelect: (s: Selection) => void;
}

const PAGE_ITEMS: { page: Page; label: string; icon: string }[] = [
  { page: "calendar", label: "Kalendar", icon: "📆" },
  { page: "eisenhower", label: "Eisenhower", icon: "🧭" },
  { page: "habits", label: "Odatlar", icon: "🔥" },
  { page: "groups", label: "Jamoa", icon: "👥" },
  { page: "stats", label: "Statistika", icon: "📈" },
  { page: "pomodoro", label: "Pomodoro", icon: "🍅" },
  { page: "countdown", label: "Sanoq", icon: "⏳" },
  { page: "settings", label: "Sozlamalar", icon: "⚙️" },
];

export function CommandPalette({ tasks, habits, projects, onSelectTask, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+K bilan ochish
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const close = () => setOpen(false);

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [];
    for (const p of PAGE_ITEMS) {
      all.push({
        kind: "page",
        id: p.page,
        label: p.label,
        hint: "Sahifa",
        icon: p.icon,
        action: () => onSelect({ kind: "page", page: p.page }),
      });
    }
    for (const p of projects) {
      all.push({
        kind: "project",
        id: p.id,
        label: p.name,
        hint: "Loyiha",
        icon: "📁",
        action: () => onSelect({ kind: "project", id: p.id }),
      });
    }
    for (const t of tasks) {
      all.push({
        kind: "task",
        id: t.id,
        label: t.title,
        hint: t.completed ? "Vazifa · bajarilgan" : "Vazifa",
        icon: t.completed ? "✅" : "⚪",
        action: () => onSelectTask(t.id),
      });
    }
    for (const h of habits) {
      all.push({
        kind: "habit",
        id: h.id,
        label: h.name,
        hint: "Odat",
        icon: "🔥",
        action: () => onSelect({ kind: "page", page: "habits" }),
      });
    }
    return all;
  }, [tasks, habits, projects, onSelect, onSelectTask]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items.slice(0, 8);
    return items.filter((i) => i.label.toLowerCase().includes(term)).slice(0, 12);
  }, [items, q]);

  useEffect(() => {
    if (active >= filtered.length) setActive(0);
  }, [filtered, active]);

  if (!open) return null;

  const run = (i: Item) => {
    i.action();
    close();
  };

  return (
    <div className="cmdk-overlay" onClick={close}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdk-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Qidirish… (vazifa, loyiha, sahifa)"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && filtered[active]) {
              e.preventDefault();
              run(filtered[active]);
            }
          }}
        />
        <div className="cmdk-list">
          {filtered.length === 0 && <div className="cmdk-empty">Hech narsa topilmadi</div>}
          {filtered.map((i, idx) => (
            <button
              key={`${i.kind}:${i.id}`}
              className={`cmdk-item ${idx === active ? "active" : ""}`}
              onMouseEnter={() => setActive(idx)}
              onClick={() => run(i)}
            >
              <span className="cmdk-icon">{i.icon}</span>
              <span className="cmdk-label">{i.label}</span>
              <span className="cmdk-hint">{i.hint}</span>
            </button>
          ))}
        </div>
        <div className="cmdk-foot">
          <span>↑↓ tanlash</span>
          <span>↵ ochish</span>
          <span>Esc yopish</span>
        </div>
      </div>
    </div>
  );
}
