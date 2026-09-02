import type { Project, Task, User } from "./types";

const BASE = "/api";
const TOKEN_KEY = "challanger_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/// 401 bo'lganda chaqiriladigan handler (App o'rnatadi)
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(BASE + path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (res.status === 401) {
    onUnauthorized?.();
    throw new Error("avtorizatsiya talab qilinadi");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "so'rov xatosi");
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export interface TaskFilters {
  project_id?: string;
  completed?: boolean;
  view?: "today" | "upcoming" | "overdue";
}

interface AuthResponse {
  token: string;
  user: User;
}

export const api = {
  // --- Auth ---
  signup: (data: { username: string; email: string; password: string }) =>
    req<AuthResponse>("/auth/signup", { method: "POST", body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    req<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  me: () => req<User>("/auth/me"),

  // --- Loyihalar ---
  listProjects: () => req<Project[]>("/projects"),
  createProject: (data: { name: string; color?: string }) =>
    req<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<Project>) =>
    req<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    req<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),

  // --- Vazifalar ---
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
