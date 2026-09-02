import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { Project, Task } from "./types";
import { Sidebar, type Selection } from "./components/Sidebar";
import { TaskItem } from "./components/TaskItem";
import { TaskDetail } from "./components/TaskDetail";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "smart", view: "today" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [quick, setQuick] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Dastlabki yuklash
  useEffect(() => {
    Promise.all([api.listProjects(), api.listTasks()])
      .then(([p, t]) => {
        setProjects(p);
        setTasks(t);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  // Brauzer bildirishnomalariga ruxsat
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Eslatmalarni kuzatish (har 30 soniyada)
  const notified = useRef<Set<string>>(new Set());
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      for (const t of tasks) {
        if (t.completed || !t.reminder_at) continue;
        const at = new Date(t.reminder_at).getTime();
        const key = `${t.id}:${t.reminder_at}`;
        if (at <= now && at > now - 3600_000 && !notified.current.has(key)) {
          notified.current.add(key);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("⏰ Eslatma", { body: t.title });
          }
        }
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [tasks]);

  // Tanlovga qarab filtrlangan ro'yxat
  const visible = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday.getTime() + 86400000);

    let list = tasks.filter((t) => showCompleted || !t.completed);

    if (selection.kind === "project") {
      list = list.filter((t) => t.project_id === selection.id);
    } else if (selection.view === "today") {
      list = list.filter(
        (t) => t.due_date && new Date(t.due_date) < endOfToday && !t.completed
      );
    } else if (selection.view === "upcoming") {
      list = list.filter(
        (t) => t.due_date && new Date(t.due_date) >= endOfToday && !t.completed
      );
    }
    return list;
  }, [tasks, selection, showCompleted]);

  const counts = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday.getTime() + 86400000);
    const active = tasks.filter((t) => !t.completed);
    const byProject: Record<string, number> = {};
    for (const t of active) {
      if (t.project_id) byProject[t.project_id] = (byProject[t.project_id] ?? 0) + 1;
    }
    return {
      today: active.filter((t) => t.due_date && new Date(t.due_date) < endOfToday).length,
      upcoming: active.filter((t) => t.due_date && new Date(t.due_date) >= endOfToday).length,
      all: active.length,
      byProject,
    };
  }, [tasks]);

  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;

  // ---- Mutatsiyalar (optimistik emas, oddiy qayta yuklash) ----
  const upsertTask = (t: Task) =>
    setTasks((prev) => {
      const i = prev.findIndex((x) => x.id === t.id);
      if (i === -1) return [...prev, t];
      const copy = [...prev];
      copy[i] = t;
      return copy;
    });

  const addQuickTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = quick.trim();
    if (!title) return;
    setQuick("");
    // Tanlovga qarab standart qiymatlar
    const defaults: Partial<Task> = {};
    if (selection.kind === "project") defaults.project_id = selection.id;
    if (selection.kind === "smart" && selection.view === "today") {
      const d = new Date();
      d.setHours(23, 59, 0, 0);
      defaults.due_date = d.toISOString();
    }
    try {
      const created = await api.createTask({ title, ...defaults });
      upsertTask(created);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const patchTask = async (id: string, patch: Partial<Task>) => {
    try {
      const updated = await api.updateTask(id, patch);
      upsertTask(updated);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const completeTask = async (id: string) => {
    try {
      const updated = await api.completeTask(id);
      upsertTask(updated);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const removeTask = async (id: string) => {
    try {
      await api.deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const addProject = async (name: string) => {
    try {
      const p = await api.createProject({ name });
      setProjects((prev) => [...prev, p]);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const removeProject = async (id: string) => {
    try {
      await api.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      // Loyihasi o'chirilgan vazifalarni yangilash
      setTasks((prev) =>
        prev.map((t) => (t.project_id === id ? { ...t, project_id: null } : t))
      );
      if (selection.kind === "project" && selection.id === id)
        setSelection({ kind: "smart", view: "today" });
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const heading =
    selection.kind === "project"
      ? projects.find((p) => p.id === selection.id)?.name ?? "Loyiha"
      : selection.view === "today"
      ? "Bugun"
      : selection.view === "upcoming"
      ? "Kelgusi"
      : "Barcha vazifalar";

  return (
    <div className="app">
      <Sidebar
        projects={projects}
        counts={counts}
        selection={selection}
        onSelect={(s) => {
          setSelection(s);
          setSelectedId(null);
        }}
        onCreateProject={addProject}
        onDeleteProject={removeProject}
      />

      <main className="main">
        <header className="main-head">
          <h2>{heading}</h2>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            Bajarilganlar
          </label>
        </header>

        {error && (
          <div className="error-bar" onClick={() => setError(null)}>
            ⚠️ {error} (yopish uchun bosing)
          </div>
        )}

        <form className="quick-add" onSubmit={addQuickTask}>
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="+ Vazifa qo'shish… (Enter)"
          />
        </form>

        <div className="task-list">
          {visible.length === 0 ? (
            <div className="empty">Vazifa yo'q 🎉</div>
          ) : (
            visible.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                selected={t.id === selectedId}
                onSelect={() => setSelectedId(t.id)}
                onComplete={() => completeTask(t.id)}
              />
            ))
          )}
        </div>
      </main>

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          projects={projects}
          onChange={(patch) => patchTask(selectedTask.id, patch)}
          onDelete={() => removeTask(selectedTask.id)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
