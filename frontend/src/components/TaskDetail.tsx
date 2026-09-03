import { useEffect, useState } from "react";
import type { Project, Recurrence, Subtask, Task } from "../types";
import { PRIORITY_LABELS } from "../types";
import { fromLocalInput, toLocalInput } from "../util";

interface Props {
  task: Task;
  projects: Project[];
  subtasks: Subtask[];
  onChange: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onClose: () => void;
  onAddSubtask: (title: string) => void;
  onToggleSubtask: (id: string, done: boolean) => void;
  onRenameSubtask: (id: string, title: string) => void;
  onDeleteSubtask: (id: string) => void;
}

export function TaskDetail({
  task,
  projects,
  subtasks,
  onChange,
  onDelete,
  onClose,
  onAddSubtask,
  onToggleSubtask,
  onRenameSubtask,
  onDeleteSubtask,
}: Props) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [tagInput, setTagInput] = useState("");
  const [subInput, setSubInput] = useState("");

  // Boshqa vazifa tanlansa mahalliy holatni yangilaymiz
  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes);
    setTagInput("");
    setSubInput("");
  }, [task.id]);

  const doneCount = subtasks.filter((s) => s.done).length;
  const submitSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    const t = subInput.trim();
    if (!t) return;
    onAddSubtask(t);
    setSubInput("");
  };

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t) return;
    if ((task.tags ?? []).includes(t)) {
      setTagInput("");
      return;
    }
    onChange({ tags: [...(task.tags ?? []), t] });
    setTagInput("");
  };
  const removeTag = (t: string) =>
    onChange({ tags: (task.tags ?? []).filter((x) => x !== t) });

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
        <label>
          Kichik qadamlar{subtasks.length > 0 && ` (${doneCount}/${subtasks.length})`}
        </label>
        {subtasks.length > 0 && (
          <div className="subtask-progress">
            <div
              className="subtask-progress-fill"
              style={{ width: `${(doneCount / subtasks.length) * 100}%` }}
            />
          </div>
        )}
        <div className="subtask-list">
          {subtasks.map((s) => (
            <div key={s.id} className={`subtask-row ${s.done ? "done" : ""}`}>
              <input
                type="checkbox"
                checked={s.done}
                onChange={(e) => onToggleSubtask(s.id, e.target.checked)}
              />
              <input
                className="subtask-title"
                defaultValue={s.title}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== s.title) onRenameSubtask(s.id, v);
                }}
              />
              <button className="subtask-del" onClick={() => onDeleteSubtask(s.id)} title="O'chirish">
                ×
              </button>
            </div>
          ))}
        </div>
        <form className="subtask-add" onSubmit={submitSubtask}>
          <input
            value={subInput}
            onChange={(e) => setSubInput(e.target.value)}
            placeholder="+ Qadam qo'shish"
          />
        </form>
      </div>

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

      <div className="field">
        <label>Teglar</label>
        <div className="tag-editor">
          {(task.tags ?? []).map((t) => (
            <span key={t} className="tag-chip">
              #{t}
              <button type="button" onClick={() => removeTag(t)} title="O'chirish">×</button>
            </span>
          ))}
          <input
            className="tag-input"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagInput);
              } else if (e.key === "Backspace" && !tagInput && (task.tags ?? []).length) {
                removeTag(task.tags[task.tags.length - 1]);
              }
            }}
            onBlur={() => addTag(tagInput)}
            placeholder={(task.tags ?? []).length ? "" : "+ teg"}
          />
        </div>
      </div>

      <button className="danger" onClick={onDelete}>
        🗑 Vazifani o'chirish
      </button>
    </aside>
  );
}
