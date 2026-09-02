import type { Task } from "../types";
import { PRIORITY_COLORS } from "../types";
import { formatDue } from "../util";

interface Props {
  task: Task;
  selected: boolean;
  onSelect: () => void;
  onComplete: () => void;
}

export function TaskItem({ task, selected, onSelect, onComplete }: Props) {
  const due = formatDue(task.due_date);
  return (
    <div className={`task-item ${selected ? "selected" : ""} ${task.completed ? "done" : ""}`}>
      <button
        className="checkbox"
        style={{ borderColor: PRIORITY_COLORS[task.priority] }}
        onClick={(e) => {
          e.stopPropagation();
          onComplete();
        }}
        aria-label="Bajarildi"
      >
        {task.completed ? "✓" : ""}
      </button>

      <div className="task-body" onClick={onSelect}>
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          {due.text && <span className={`due tone-${due.tone}`}>{due.text}</span>}
          {task.recurrence && <span className="recur">🔁 {task.recurrence}</span>}
          {task.reminder_at && <span className="reminder">⏰</span>}
          {task.notes && <span className="has-notes">📝</span>}
        </div>
      </div>
    </div>
  );
}
