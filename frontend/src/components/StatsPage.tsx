import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { GroupDetail, Habit, Project, Subtask, Task } from "../types";
import { PRIORITY_COLORS, PRIORITY_LABELS } from "../types";
import { StatTile, LineChart, HBarChart, Donut, ColumnChart } from "./charts";

const S1 = "var(--viz-s1)"; // ko'k
const S2 = "var(--viz-s2)"; // aqua
const MUTED = "var(--viz-remaining)";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentStreak(days: Set<string>): number {
  let s = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (!days.has(ymd(d))) d.setTime(d.getTime() - 86400000);
  while (days.has(ymd(d))) {
    s++;
    d.setTime(d.getTime() - 86400000);
  }
  return s;
}

interface Data {
  tasks: Task[];
  habits: Habit[];
  subtasks: Subtask[];
  projects: Project[];
  groups: GroupDetail[];
}

export function StatsPage({ userId }: { userId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [tasks, habits, subtasks, projects, groupList] = await Promise.all([
          api.listTasks({}),
          api.listHabits(),
          api.listSubtasks(),
          api.listProjects(),
          api.listGroups(),
        ]);
        const groups = await Promise.all(groupList.map((g) => api.getGroup(g.id)));
        setData({ tasks, habits, subtasks, projects, groups });
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    })();
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const { tasks, habits, subtasks, projects, groups } = data;

    // ----- KPI -----
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.completed).length;
    const groupTasksDone = groups.reduce(
      (s, g) => s + g.tasks.filter((t) => t.done && t.done_by === userId).length,
      0
    );
    const completionRate = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

    let groupCheckins = 0;
    for (const g of groups)
      for (const h of g.habits) groupCheckins += (h.entries[userId] ?? []).length;
    const habitCheckins = habits.reduce((s, h) => s + h.days.length, 0) + groupCheckins;

    const bestStreak = Math.max(0, ...habits.map((h) => currentStreak(new Set(h.days))));
    const subDone = subtasks.filter((s) => s.done).length;

    // ----- 30 kunlik chiziq -----
    const days: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) days.push(ymd(new Date(today.getTime() - i * 86400000)));
    const dayIndex = new Map(days.map((d, i) => [d, i]));

    const taskDone30 = new Array(30).fill(0);
    for (const t of tasks) {
      if (t.completed && t.completed_at) {
        const key = ymd(new Date(t.completed_at));
        const i = dayIndex.get(key);
        if (i !== undefined) taskDone30[i]++;
      }
    }
    const habit30 = new Array(30).fill(0);
    for (const h of habits)
      for (const d of h.days) {
        const i = dayIndex.get(d);
        if (i !== undefined) habit30[i]++;
      }
    for (const g of groups)
      for (const h of g.habits)
        for (const d of h.entries[userId] ?? []) {
          const i = dayIndex.get(d);
          if (i !== undefined) habit30[i]++;
        }
    const lineLabels = days.map((d) => d.slice(8)); // kun raqami

    // ----- Prioritet donut -----
    const byPrio = [0, 1, 2, 3].map((p) => ({
      label: PRIORITY_LABELS[p],
      value: tasks.filter((t) => t.priority === p).length,
      color: PRIORITY_COLORS[p],
    }));

    // ----- Loyihalar (bajarilgan/qolgan) -----
    const projRows = projects
      .map((p) => {
        const pts = tasks.filter((t) => t.project_id === p.id);
        const done = pts.filter((t) => t.completed).length;
        const rest = pts.length - done;
        return {
          label: p.name,
          color: p.color,
          value: pts.length,
          segments: [
            { value: done, color: p.color, name: "bajarilgan" },
            { value: rest, color: MUTED, name: "qolgan" },
          ],
        };
      })
      .filter((r) => r.value > 0);
    const noProj = tasks.filter((t) => !t.project_id);
    if (noProj.length) {
      const done = noProj.filter((t) => t.completed).length;
      projRows.push({
        label: "Loyihasiz",
        color: MUTED,
        value: noProj.length,
        segments: [
          { value: done, color: S1, name: "bajarilgan" },
          { value: noProj.length - done, color: MUTED, name: "qolgan" },
        ],
      });
    }
    projRows.sort((a, b) => b.value - a.value);

    // ----- Teglar top -----
    const tagCount = new Map<string, number>();
    for (const t of tasks) for (const tag of t.tags ?? []) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    const tagRows = [...tagCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ label: `#${tag}`, color: S1, value: count }));

    // ----- Hafta kunlari bo'yicha faollik -----
    const wdNames = ["Du", "Se", "Cho", "Pa", "Ju", "Sha", "Ya"];
    const wd = new Array(7).fill(0);
    const addWd = (iso: string) => {
      const dt = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
      wd[(dt.getDay() + 6) % 7]++;
    };
    for (const t of tasks) if (t.completed && t.completed_at) addWd(t.completed_at);
    for (const h of habits) for (const d of h.days) addWd(d);
    for (const g of groups) for (const h of g.habits) for (const d of h.entries[userId] ?? []) addWd(d);
    const weekdayData = wdNames.map((label, i) => ({ label, value: wd[i] }));

    // ----- Odatlar shu hafta -----
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const weekDays = Array.from({ length: 7 }, (_, i) => ymd(new Date(monday.getTime() + i * 86400000)));
    const habitRows = habits
      .map((h) => {
        const set = new Set(h.days);
        const cnt = weekDays.filter((d) => set.has(d)).length;
        return { label: h.name, color: h.color, value: cnt };
      })
      .sort((a, b) => b.value - a.value);

    return {
      kpi: { totalTasks, doneTasks, groupTasksDone, completionRate, habitCheckins, bestStreak, subDone, subTotal: subtasks.length },
      line: { labels: lineLabels, series: [
        { name: "Vazifalar", color: S1, points: taskDone30 },
        { name: "Odatlar", color: S2, points: habit30 },
      ] },
      byPrio,
      projRows,
      tagRows,
      weekdayData,
      habitRows,
      hasGroups: groups.length > 0,
    };
  }, [data, userId]);

  if (error) return <div className="page stats-page"><div className="error-bar">⚠️ {error}</div></div>;
  if (!stats) return <div className="page stats-page"><div className="page-head"><h2>Statistika</h2></div><div className="empty">Yuklanmoqda…</div></div>;

  return (
    <div className="page stats-page">
      <div className="page-head">
        <h2>Statistika</h2>
        <span className="page-hint">Barcha bo'limlar bo'yicha umumiy ko'rsatkichlar</span>
      </div>

      {/* KPI tiles */}
      <div className="stat-cards">
        <StatTile value={stats.kpi.completionRate + "%"} label="Vazifa bajarish darajasi" icon="🎯" accent={S1} />
        <StatTile value={stats.kpi.doneTasks} label="Bajarilgan vazifalar" icon="✅" />
        <StatTile value={stats.kpi.totalTasks} label="Jami vazifalar" icon="📋" />
        <StatTile value={stats.kpi.habitCheckins} label="Odat belgilashlari" icon="🔥" />
        <StatTile value={stats.kpi.bestStreak} label="Eng yaxshi joriy streak" icon="🏆" />
        <StatTile value={`${stats.kpi.subDone}/${stats.kpi.subTotal}`} label="Kichik qadamlar" icon="☑" />
        {stats.hasGroups && (
          <StatTile value={stats.kpi.groupTasksDone} label="Jamoada bajargan" icon="👥" />
        )}
      </div>

      <div className="chart-grid">
        {/* 30 kunlik faollik */}
        <div className="chart-card wide">
          <h3>Oxirgi 30 kun — bajarilgan vazifa va odatlar</h3>
          <LineChart series={stats.line.series} labels={stats.line.labels} />
        </div>

        {/* Prioritet */}
        <div className="chart-card">
          <h3>Prioritet bo'yicha vazifalar</h3>
          <Donut
            data={stats.byPrio}
            centerLabel="jami"
            centerValue={stats.kpi.totalTasks}
          />
        </div>

        {/* Hafta kunlari */}
        <div className="chart-card">
          <h3>Hafta kunlari bo'yicha faollik</h3>
          <ColumnChart data={stats.weekdayData} color={S1} />
        </div>

        {/* Loyihalar */}
        <div className="chart-card">
          <h3>Loyihalar bo'yicha (bajarilgan / qolgan)</h3>
          <HBarChart rows={stats.projRows} />
          <div className="chart-legend">
            <span className="legend-item"><span className="legend-swatch" style={{ background: S1 }} />bajarilgan</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: MUTED }} />qolgan</span>
          </div>
        </div>

        {/* Odatlar shu hafta */}
        <div className="chart-card">
          <h3>Odatlar — shu hafta (kun)</h3>
          <HBarChart rows={stats.habitRows} />
        </div>

        {/* Teglar */}
        {stats.tagRows.length > 0 && (
          <div className="chart-card">
            <h3>Eng ko'p ishlatilgan teglar</h3>
            <HBarChart rows={stats.tagRows} />
          </div>
        )}
      </div>
    </div>
  );
}
