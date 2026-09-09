import { useState } from "react";
import type { Task } from "../types";
import { useT } from "../i18n";

interface Props {
  tasks: Task[];
  onSetQuadrant: (id: string, q: number) => void;
  onSelectTask: (id: string) => void;
}

const QUADRANTS = [
  { q: 1, cls: "q1" },
  { q: 2, cls: "q2" },
  { q: 3, cls: "q3" },
  { q: 4, cls: "q4" },
];

/// Aniq tayinlanmagan vazifa uchun prioritet va muddatdan kvadrant taxmini
function derive(t: Task): number {
  const important = t.priority >= 2;
  let urgent = false;
  if (t.due_date) {
    const days = (new Date(t.due_date).getTime() - Date.now()) / 86400000;
    urgent = days <= 2; // 2 kun ichida yoki o'tib ketgan
  }
  if (important && urgent) return 1;
  if (important && !urgent) return 2;
  if (!important && urgent) return 3;
  return 4;
}

export function EisenhowerPage({ tasks, onSetQuadrant, onSelectTask }: Props) {
  const t = useT();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const active = tasks.filter((task) => !task.completed);
  const quadrantOf = (task: Task) => task.eisenhower ?? derive(task);

  return (
    <div className="page eisenhower-page">
      <div className="page-head">
        <h2>{t("eisen.title")}</h2>
        <span className="page-hint">{t("eisen.hint")}</span>
      </div>

      <div className="matrix">
        {QUADRANTS.map(({ q, cls }) => {
          const items = active.filter((task) => quadrantOf(task) === q);
          const title = t(`eisen.q${q}.title`);
          const sub = t(`eisen.q${q}.sub`);
          return (
            <div
              key={q}
              className={`quadrant ${cls} ${over === q ? "over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(q);
              }}
              onDragLeave={() => setOver((o) => (o === q ? null : o))}
              onDrop={() => {
                if (dragId) onSetQuadrant(dragId, q);
                setDragId(null);
                setOver(null);
              }}
            >
              <div className="quadrant-head">
                <strong>{title}</strong>
                <span>{sub}</span>
              </div>
              <div className="quadrant-body">
                {items.map((task) => (
                  <div
                    key={task.id}
                    className="matrix-card"
                    draggable
                    onDragStart={() => setDragId(task.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => onSelectTask(task.id)}
                  >
                    {task.title}
                  </div>
                ))}
                {items.length === 0 && <div className="quadrant-empty">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
