import { useEffect, useState } from "react";
import type { Project, Recurrence, Subtask, Task } from "../types";
import { fromLocalInput, toLocalInput } from "../util";
import { useT, priorityLabel } from "../i18n";

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
  const t = useT();
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
          {t("detail.done")}
        </label>
        <button className="icon-btn" onClick={onClose} title={t("common.close")}>
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
        placeholder={t("detail.notesPlaceholder")}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== task.notes && onChange({ notes })}
      />

      <div className="field">
        <label>
          {t("detail.subtasks")}{subtasks.length > 0 && ` (${doneCount}/${subtasks.length})`}
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
              <button className="subtask-del" onClick={() => onDeleteSubtask(s.id)} title={t("common.delete")}>
                ×
              </button>
            </div>
          ))}
        </div>
        <form className="subtask-add" onSubmit={submitSubtask}>
          <input
            value={subInput}
            onChange={(e) => setSubInput(e.target.value)}
            placeholder={t("detail.subtaskAdd")}
          />
        </form>
      </div>

      <div className="field">
        <label>{t("detail.project")}</label>
        <select
          value={task.project_id ?? ""}
          onChange={(e) => onChange({ project_id: e.target.value || null })}
        >
          <option value="">{t("detail.projectNone")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>{t("detail.due")}</label>
        <input
          type="datetime-local"
          value={toLocalInput(task.due_date)}
          onChange={(e) => onChange({ due_date: fromLocalInput(e.target.value) })}
        />
      </div>

      <div className="field">
        <label>{t("detail.priority")}</label>
        <select
          value={task.priority}
          onChange={(e) => onChange({ priority: Number(e.target.value) })}
        >
          {[0, 1, 2, 3].map((v) => (
            <option key={v} value={v}>
              {priorityLabel(v)}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>{t("detail.recurrence")}</label>
        <select
          value={task.recurrence ?? ""}
          onChange={(e) =>
            onChange({ recurrence: (e.target.value || null) as Recurrence })
          }
        >
          <option value="">{t("recur.none")}</option>
          <option value="daily">{t("recur.daily")}</option>
          <option value="weekdays">{t("recur.weekdaysLong")}</option>
          <option value="weekly">{t("recur.weekly")}</option>
          <option value="biweekly">{t("recur.biweekly")}</option>
          <option value="monthly">{t("recur.monthly")}</option>
          <option value="yearly">{t("recur.yearly")}</option>
        </select>
      </div>

      <div className="field">
        <label>{t("detail.reminder")}</label>
        <input
          type="datetime-local"
          value={toLocalInput(task.reminder_at)}
          onChange={(e) => onChange({ reminder_at: fromLocalInput(e.target.value) })}
        />
      </div>

      <div className="field">
        <label>{t("detail.tags")}</label>
        <div className="tag-editor">
          {(task.tags ?? []).map((tag) => (
            <span key={tag} className="tag-chip">
              #{tag}
              <button type="button" onClick={() => removeTag(tag)} title={t("common.delete")}>×</button>
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
            placeholder={(task.tags ?? []).length ? "" : t("detail.tagPlaceholder")}
          />
        </div>
      </div>

      <button className="danger" onClick={onDelete}>
        {t("detail.deleteTask")}
      </button>
    </aside>
  );
}
