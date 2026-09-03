import type { GroupDetail, GroupHabit, GroupSummary, GroupTask, Habit, Project, Subtask, Task, User } from "./types";

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
  updateProfile: (data: { username?: string; email?: string }) =>
    req<User>("/auth/me", { method: "PATCH", body: JSON.stringify(data) }),
  changePassword: (data: { current_password: string; new_password: string }) =>
    req<{ ok: boolean }>("/auth/password", { method: "POST", body: JSON.stringify(data) }),
  deleteAccount: () => req<{ ok: boolean }>("/auth/me", { method: "DELETE" }),

  // --- Telegram ---
  telegramStatus: () =>
    req<{ configured: boolean; connected: boolean }>("/telegram/status"),
  telegramLink: () =>
    req<{ deep_link: string; bot_username: string; code: string }>("/telegram/link", {
      method: "POST",
    }),
  telegramUnlink: () => req<{ ok: boolean }>("/telegram/unlink", { method: "POST" }),

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

  // --- Kichik qadamlar (subtasks) ---
  listSubtasks: () => req<Subtask[]>("/subtasks"),
  createSubtask: (taskId: string, title: string) =>
    req<Subtask>(`/tasks/${taskId}/subtasks`, { method: "POST", body: JSON.stringify({ title }) }),
  updateSubtask: (id: string, data: Partial<Pick<Subtask, "title" | "done" | "position">>) =>
    req<Subtask>(`/subtasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSubtask: (id: string) =>
    req<{ ok: boolean }>(`/subtasks/${id}`, { method: "DELETE" }),

  // --- Odatlar (habit tracker) ---
  listHabits: () => req<Habit[]>("/habits"),
  createHabit: (data: {
    name: string;
    color?: string;
    frequency?: "daily" | "weekly";
    target_per_week?: number;
    duration_days?: number;
    end_date?: string | null;
  }) => req<Habit>("/habits", { method: "POST", body: JSON.stringify(data) }),
  updateHabit: (id: string, data: Partial<Habit>) =>
    req<Habit>(`/habits/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteHabit: (id: string) =>
    req<{ ok: boolean }>(`/habits/${id}`, { method: "DELETE" }),
  toggleHabit: (id: string, day: string) =>
    req<{ day: string; done: boolean }>(`/habits/${id}/toggle`, {
      method: "POST",
      body: JSON.stringify({ day }),
    }),

  // --- Jamoa (groupwork) ---
  listGroups: () => req<GroupSummary[]>("/groups"),
  createGroup: (name: string) =>
    req<GroupSummary>("/groups", { method: "POST", body: JSON.stringify({ name }) }),
  joinGroup: (code: string) =>
    req<{ ok: boolean; group_id: string }>("/groups/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  getGroup: (id: string) => req<GroupDetail>(`/groups/${id}`),
  deleteGroup: (id: string) => req<{ ok: boolean }>(`/groups/${id}`, { method: "DELETE" }),
  leaveGroup: (id: string) =>
    req<{ ok: boolean }>(`/groups/${id}/leave`, { method: "POST" }),
  addGroupMember: (id: string, username: string) =>
    req<{ ok: boolean }>(`/groups/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ username }),
    }),
  removeGroupMember: (id: string, uid: string) =>
    req<{ ok: boolean }>(`/groups/${id}/members/${uid}`, { method: "DELETE" }),
  createGroupHabit: (
    id: string,
    data: { name: string; color?: string; frequency?: "daily" | "weekly"; target_per_week?: number }
  ) => req<GroupHabit>(`/groups/${id}/habits`, { method: "POST", body: JSON.stringify(data) }),
  deleteGroupHabit: (id: string, hid: string) =>
    req<{ ok: boolean }>(`/groups/${id}/habits/${hid}`, { method: "DELETE" }),
  toggleGroupHabit: (hid: string, day: string) =>
    req<{ day: string; done: boolean }>(`/group-habits/${hid}/toggle`, {
      method: "POST",
      body: JSON.stringify({ day }),
    }),
  reactGroupHabit: (hid: string, emoji: string) =>
    req<{ emoji: string; active: boolean }>(`/group-habits/${hid}/react`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    }),
  createGroupTask: (id: string, title: string) =>
    req<GroupTask>(`/groups/${id}/tasks`, { method: "POST", body: JSON.stringify({ title }) }),
  toggleGroupTask: (tid: string) =>
    req<GroupTask>(`/group-tasks/${tid}/toggle`, { method: "POST" }),
  deleteGroupTask: (tid: string) =>
    req<{ ok: boolean }>(`/group-tasks/${tid}`, { method: "DELETE" }),
};
