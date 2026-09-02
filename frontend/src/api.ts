import type { Project, Task } from "./types";

const BASE = "/api";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "so'rov xatosi");
  }
  // 204 yoki bo'sh javob bo'lishi mumkin
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export interface TaskFilters {
  project_id?: string;
  completed?: boolean;
  view?: "today" | "upcoming" | "overdue";
}

export const api = {
  // Loyihalar
  listProjects: () => req<Project[]>("/projects"),
  createProject: (data: { name: string; color?: string }) =>
    req<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<Project>) =>
    req<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    req<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),

  // Vazifalar
  listTasks: (filters: TaskFilters = {}) => {
    const p = new URLSearchParams();
    if (filters.project_id) p.set("project_id", filters.project_id);
    if (filters.completed !== undefined) p.set("completed", String(filters.completed));
    if (filters.view) p.set("view", filters.view);
    const qs = p.toString();
    return req<Task[]>(`/tasks${qs ? `?${qs}` : ""}`);
  },
  createTask: (data: Partial<Task>) =>
    req<Task>("/tasks", { method: "POST", body: JSON.stringify(data) }),
  updateTask: (id: string, data: Partial<Task>) =>
    req<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  completeTask: (id: string) =>
    req<Task>(`/tasks/${id}/complete`, { method: "POST" }),
  deleteTask: (id: string) =>
    req<{ ok: boolean }>(`/tasks/${id}`, { method: "DELETE" }),
};
