import { useEffect, useState } from "react";
import type { Project, Recurrence, Task } from "../types";
import { PRIORITY_LABELS } from "../types";
import { fromLocalInput, toLocalInput } from "../util";

interface Props {
  task: Task;
  projects: Project[];
  onChange: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function TaskDetail({ task, projects, onChange, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);

  // Boshqa vazifa tanlansa mahalliy holatni yangilaymiz
  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes);
  }, [task.id]);

  return (
    <aside className="detail">
      <div className="detail-head">
        <label className="detail-check">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={(e) => onChange({ completed: e.target.checked })}
          />
          Bajarildi
        </label>
        <button className="icon-btn" onClick={onClose} title="Yopish">
          ×
        </button>
      </div>

      <input
        className="detail-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== task.title && onChange({ title: title.trim() })}
      />

      <textarea
        className="detail-notes"
        placeholder="Izoh qo'shing…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== task.notes && onChange({ notes })}
      />

      <div className="field">
        <label>Loyiha</label>
        <select
          value={task.project_id ?? ""}
          onChange={(e) => onChange({ project_id: e.target.value || null })}
        >
          <option value="">— Yo'q —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Muddat (due)</label>
        <input
          type="datetime-local"
          value={toLocalInput(task.due_date)}
          onChange={(e) => onChange({ due_date: fromLocalInput(e.target.value) })}
        />
      </div>

      <div className="field">
        <label>Prioritet</label>
        <select
          value={task.priority}
          onChange={(e) => onChange({ priority: Number(e.target.value) })}
        >
          {Object.entries(PRIORITY_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Takrorlanish</label>
        <select
          value={task.recurrence ?? ""}
          onChange={(e) =>
            onChange({ recurrence: (e.target.value || null) as Recurrence })
          }
        >
          <option value="">Yo'q</option>
          <option value="daily">Har kuni</option>
          <option value="weekly">Har hafta</option>
          <option value="monthly">Har oy</option>
          <option value="yearly">Har yil</option>
        </select>
      </div>

      <div className="field">
        <label>Eslatma (reminder)</label>
        <input
          type="datetime-local"
          value={toLocalInput(task.reminder_at)}
          onChange={(e) => onChange({ reminder_at: fromLocalInput(e.target.value) })}
        />
      </div>

      <button className="danger" onClick={onDelete}>
        🗑 Vazifani o'chirish
      </button>
    </aside>
  );
}
