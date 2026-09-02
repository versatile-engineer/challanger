export interface User {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

export type Recurrence = "daily" | "weekly" | "monthly" | "yearly" | null;

export interface Task {
  id: string;
  project_id: string | null;
  title: string;
  notes: string;
  completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  priority: number; // 0..3
  recurrence: Recurrence;
  reminder_at: string | null;
  eisenhower: number | null; // 1..4 kvadrant
  position: number;
  created_at: string;
  updated_at: string;
}

export type HabitFrequency = "daily" | "weekly";

export interface Habit {
  id: string;
  name: string;
  color: string;
  frequency: HabitFrequency;
  target_per_week: number; // 'weekly' bo'lganda haftada necha marta
  start_date: string; // ISO sana (YYYY-MM-DD)
  duration_days: number | null; // davomiylik kunda (NULL = belgilanmagan)
  end_date: string | null; // aniq tugash sanasi (NULL = belgilanmagan)
  position: number;
  created_at: string;
  days: string[]; // bajarilgan kunlar (ISO sana)
}

export const PRIORITY_LABELS: Record<number, string> = {
  0: "Yo'q",
  1: "Past",
  2: "O'rta",
  3: "Yuqori",
};

export const PRIORITY_COLORS: Record<number, string> = {
  0: "#94a3b8",
  1: "#3b82f6",
  2: "#f59e0b",
  3: "#ef4444",
};
