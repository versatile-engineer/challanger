import { useState } from "react";
import type { Task } from "../types";

interface Props {
  tasks: Task[];
  onSetQuadrant: (id: string, q: number) => void;
  onSelectTask: (id: string) => void;
}

const QUADRANTS = [
  { q: 1, title: "Bajaring", sub: "Shoshilinch + Muhim", cls: "q1" },
  { q: 2, title: "Rejalashtiring", sub: "Muhim, shoshilinch emas", cls: "q2" },
  { q: 3, title: "Topshiring", sub: "Shoshilinch, muhim emas", cls: "q3" },
  { q: 4, title: "O'chiring", sub: "Na shoshilinch, na muhim", cls: "q4" },
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
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const active = tasks.filter((t) => !t.completed);
  const quadrantOf = (t: Task) => t.eisenhower ?? derive(t);

  return (
    <div className="page eisenhower-page">
      <div className="page-head">
        <h2>Eisenhower matritsasi</h2>
        <span className="page-hint">Vazifalarni sudrab kvadrantlarga joylang</span>
      </div>

      <div className="matrix">
        {QUADRANTS.map(({ q, title, sub, cls }) => {
          const items = active.filter((t) => quadrantOf(t) === q);
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
                {items.map((t) => (
                  <div
                    key={t.id}
                    className="matrix-card"
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => onSelectTask(t.id)}
                  >
                    {t.title}
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
