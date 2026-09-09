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

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
  created_at: string;
}

export type Recurrence =
  | "daily"
  | "weekdays"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "yearly"
  | null;

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
  tags: string[];
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

// ---- Jamoa (groupwork) ----
export type GroupRole = "owner" | "admin" | "member";

export interface GroupSummary {
  id: string;
  name: string;
  emoji: string;
  invite_code: string;
  owner_id: string;
  role: GroupRole;
  member_count: number;
}

export interface GroupMember {
  user_id: string;
  username: string;
  role: GroupRole;
  joined_at: string;
}

export interface GroupHabit {
  id: string;
  name: string;
  color: string;
  frequency: HabitFrequency;
  target_per_week: number;
  created_at: string;
  entries: Record<string, string[]>; // user_id -> bajarilgan kunlar (ISO)
  reactions: Record<string, number>; // emoji -> soni
  my_reactions: string[]; // joriy foydalanuvchi bosgan emoji'lar
}

export interface GroupTask {
  id: string;
  title: string;
  done: boolean;
  created_by: string | null;
  done_by: string | null;
  assigned_to: string | null;
  due_date: string | null;
  reminder_at: string | null;
  created_at: string;
}

export interface GroupActivity {
  id: string;
  text: string;
  created_at: string;
}

export interface GroupMessage {
  id: string;
  user_id: string | null;
  username: string;
  text: string;
  created_at: string;
}

export interface GroupChallenge {
  id: string;
  title: string;
  start_date: string; // ISO sana
  end_date: string;
}

export interface GroupDetail {
  id: string;
  name: string;
  emoji: string;
  description: string;
  invite_code: string;
  owner_id: string;
  my_role: GroupRole;
  members: GroupMember[];
  habits: GroupHabit[];
  tasks: GroupTask[];
  messages: GroupMessage[];
  challenges: GroupChallenge[];
  activity: GroupActivity[];
}

export const PRIORITY_COLORS: Record<number, string> = {
  0: "#94a3b8",
  1: "#3b82f6",
  2: "#f59e0b",
  3: "#ef4444",
};
