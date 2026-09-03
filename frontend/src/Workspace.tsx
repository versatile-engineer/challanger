import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { Habit, Project, Task, User } from "./types";
import { Sidebar, type Selection } from "./components/Sidebar";
import { TaskItem } from "./components/TaskItem";
import { TaskDetail } from "./components/TaskDetail";
import { CalendarPage } from "./components/CalendarPage";
import { EisenhowerPage } from "./components/EisenhowerPage";
import { HabitsPage } from "./components/HabitsPage";
import { PomodoroPage } from "./components/PomodoroPage";
import { CountdownPage } from "./components/CountdownPage";
import { GroupsPage } from "./components/GroupsPage";
import { SettingsPage } from "./components/SettingsPage";

interface Props {
  user: User;
  onLogout: () => void;
  onUserUpdate: (u: User) => void;
}

export default function Workspace({ user, onLogout, onUserUpdate }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "smart", view: "today" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [quick, setQuick] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Dastlabki yuklash
  useEffect(() => {
    Promise.all([api.listProjects(), api.listTasks(), api.listHabits()])
      .then(([p, t, h]) => {
        setProjects(p);
        setTasks(t);
        setHabits(h);
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
    } else if (selection.kind === "smart" && selection.view === "today") {
      list = list.filter(
        (t) => t.due_date && new Date(t.due_date) < endOfToday && !t.completed
      );
    } else if (selection.kind === "smart" && selection.view === "upcoming") {
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

  // ---- Mutatsiyalar ----
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
      setTasks((prev) =>
        prev.map((t) => (t.project_id === id ? { ...t, project_id: null } : t))
      );
      if (selection.kind === "project" && selection.id === id)
        setSelection({ kind: "smart", view: "today" });
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  // --- Odat handlerlari ---
  const addHabit = async (data: Parameters<typeof api.createHabit>[0]) => {
    try {
      const h = await api.createHabit(data);
      setHabits((prev) => [...prev, h]);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const toggleHabit = async (id: string, day: string) => {
    // Optimistik yangilash
    setHabits((prev) =>
      prev.map((h) =>
        h.id === id
          ? {
              ...h,
              days: h.days.includes(day)
                ? h.days.filter((d) => d !== day)
                : [...h.days, day],
            }
          : h
      )
    );
    try {
      await api.toggleHabit(id, day);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const removeHabit = async (id: string) => {
    try {
      await api.deleteHabit(id);
      setHabits((prev) => prev.filter((h) => h.id !== id));
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  // --- Eisenhower: kvadrantni o'rnatish ---
  const setQuadrant = (id: string, q: number) => patchTask(id, { eisenhower: q });

  // --- Kalendar: berilgan kunga vazifa qo'shish ---
  const addForDay = async (dayISO: string) => {
    const due = new Date(`${dayISO}T12:00:00`);
    try {
      const created = await api.createTask({
        title: "Yangi vazifa",
        due_date: due.toISOString(),
      });
      upsertTask(created);
      setSelectedId(created.id);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const heading =
    selection.kind === "project"
      ? projects.find((p) => p.id === selection.id)?.name ?? "Loyiha"
      : selection.kind === "smart" && selection.view === "today"
      ? "Bugun"
      : selection.kind === "smart" && selection.view === "upcoming"
      ? "Kelgusi"
      : "Barcha vazifalar";

  const renderPage = () => {
    if (selection.kind !== "page") return null;
    switch (selection.page) {
      case "calendar":
        return <CalendarPage tasks={tasks} onSelectTask={setSelectedId} onAddForDay={addForDay} />;
      case "eisenhower":
        return <EisenhowerPage tasks={tasks} onSetQuadrant={setQuadrant} onSelectTask={setSelectedId} />;
      case "habits":
        return (
          <HabitsPage habits={habits} onCreate={addHabit} onToggle={toggleHabit} onDelete={removeHabit} />
        );
      case "pomodoro":
        return <PomodoroPage />;
      case "countdown":
        return <CountdownPage />;
      case "groups":
        return <GroupsPage user={user} />;
      case "settings":
        return <SettingsPage user={user} onUserUpdate={onUserUpdate} onLogout={onLogout} />;
    }
  };

  return (
    <div className="app">
      <Sidebar
        projects={projects}
        counts={counts}
        selection={selection}
        user={user}
        onLogout={onLogout}
        onSelect={(s) => {
          setSelection(s);
          setSelectedId(null);
        }}
        onCreateProject={addProject}
        onDeleteProject={removeProject}
      />

      {selection.kind === "page" ? (
        renderPage()
      ) : (
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
      )}

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
