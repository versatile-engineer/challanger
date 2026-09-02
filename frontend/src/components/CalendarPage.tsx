import { useState } from "react";
import type { Task } from "../types";
import { PRIORITY_COLORS } from "../types";

interface Props {
  tasks: Task[];
  onSelectTask: (id: string) => void;
  onAddForDay: (dayISO: string) => void;
}

const MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];
const WEEKDAYS = ["Du", "Se", "Cho", "Pa", "Ju", "Sha", "Ya"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CalendarPage({ tasks, onSelectTask, onAddForDay }: Props) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  // Oyning birinchi kunini dushanbadan boshlab tekislash
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Yakshanba=0 -> 6
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // 6 qatorli (42 katak) grid
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  // Sana -> vazifalar
  const byDay = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.due_date) continue;
    const key = ymd(new Date(t.due_date));
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(t);
  }

  const todayKey = ymd(new Date());

  return (
    <div className="page calendar-page">
      <div className="page-head">
        <h2>{MONTHS[month]} {year}</h2>
        <div className="cal-nav">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</button>
          <button onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
            Bugun
          </button>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))}>›</button>
        </div>
      </div>

      <div className="cal-weekdays">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">{w}</div>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="cal-cell empty" />;
          const key = ymd(date);
          const dayTasks = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div key={i} className={`cal-cell ${isToday ? "today" : ""}`}>
              <div className="cal-daynum">
                <span>{date.getDate()}</span>
                <button className="cal-add" title="Vazifa qo'shish" onClick={() => onAddForDay(key)}>
                  +
                </button>
              </div>
              <div className="cal-tasks">
                {dayTasks.map((t) => (
                  <button
                    key={t.id}
                    className={`cal-task ${t.completed ? "done" : ""}`}
                    onClick={() => onSelectTask(t.id)}
                    title={t.title}
                  >
                    <span className="pd" style={{ background: PRIORITY_COLORS[t.priority] }} />
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
