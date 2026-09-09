import { useState } from "react";
import { api } from "../api";
import type { Habit } from "../types";
import { useT } from "../i18n";

interface Props {
  habits: Habit[];
  onCreate: (data: Parameters<typeof api.createHabit>[0]) => void;
  onToggle: (id: string, day: string) => void;
  onDelete: (id: string) => void;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/// Odat uchun ko'rsatiladigan kunlar.
/// - Challenge (tugash sanasi bor): boshlanishdan tugash sanasigacha — butun davr.
/// - Doimiy odat: boshlanishdan bugungacha, lekin ko'pi bilan oxirgi 30 kun.
function habitDays(h: Habit): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(h.start_date + "T00:00:00");
  start.setHours(0, 0, 0, 0);

  const end = effectiveEnd(h);
  let from = start.getTime();
  let to: number;
  if (end) {
    end.setHours(0, 0, 0, 0);
    to = end.getTime();
  } else {
    // Doimiy: bugungacha, oxirgi 30 kun bilan cheklab
    to = today.getTime();
    from = Math.max(start.getTime(), today.getTime() - 29 * 86400000);
  }

  const out: Date[] = [];
  for (let t = from; t <= to; t += 86400000) out.push(new Date(t));
  return out;
}

function streak(days: Set<string>): number {
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

/// Eng uzun ketma-ket kunlar seriyasi (butun tarix bo'yicha).
function longestStreak(days: string[]): number {
  if (days.length === 0) return 0;
  const sorted = [...days].sort();
  let best = 1;
  let cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + "T00:00:00").getTime();
    const now = new Date(sorted[i] + "T00:00:00").getTime();
    if (now - prev === 86400000) {
      cur++;
      best = Math.max(best, cur);
    } else if (now !== prev) {
      cur = 1;
    }
  }
  return best;
}

/// Oxirgi N kun uchun heatmap katakchalari (eng eskisidan bugungacha).
function heatmapDays(set: Set<string>, n = 91): { key: string; done: boolean; future: boolean }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Boshlanishni dushanbaga tekislaymiz (ustunlar to'liq haftalar bo'lishi uchun)
  const start = new Date(today.getTime() - (n - 1) * 86400000);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const out: { key: string; done: boolean; future: boolean }[] = [];
  const end = new Date(today.getTime() + ((7 - ((today.getDay() + 6) % 7) - 1) * 86400000));
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    const key = ymd(d);
    out.push({ key, done: set.has(key), future: d.getTime() > today.getTime() });
  }
  return out;
}

function weekCount(days: Set<string>): number {
  const now = new Date();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  let c = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getTime() + i * 86400000);
    if (days.has(ymd(d))) c++;
  }
  return c;
}

/// Odatning tugash sanasi (agar belgilangan bo'lsa)
function effectiveEnd(h: Habit): Date | null {
  if (h.end_date) return new Date(h.end_date + "T00:00:00");
  if (h.duration_days) {
    const start = new Date(h.start_date + "T00:00:00");
    return new Date(start.getTime() + (h.duration_days - 1) * 86400000);
  }
  return null;
}

/// Davomiylik progressi: {done, total, percent} yoki null (doimiy)
function durationProgress(h: Habit): { doneDays: number; total: number; percent: number } | null {
  const end = effectiveEnd(h);
  if (!end) return null;
  const start = new Date(h.start_date + "T00:00:00");
  const total = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  // Belgilangan davr ichida bajarilgan kunlar soni
  const doneDays = h.days.filter((d) => {
    const t = new Date(d + "T00:00:00").getTime();
    return t >= start.getTime() && t <= end.getTime();
  }).length;
  const percent = Math.min(100, Math.round((doneDays / total) * 100));
  return { doneDays, total, percent };
}

// -------- Yaratish formasi --------

type DurationMode = "forever" | "days" | "date";

function CreateForm({ onCreate }: { onCreate: Props["onCreate"] }) {
  const t = useT();
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [timesPerWeek, setTimesPerWeek] = useState(3);
  const [durationMode, setDurationMode] = useState<DurationMode>("forever");
  const [durationDays, setDurationDays] = useState(30);
  const [endDate, setEndDate] = useState("");
  const [open, setOpen] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      frequency,
      target_per_week: frequency === "weekly" ? timesPerWeek : 7,
      duration_days: durationMode === "days" ? durationDays : undefined,
      end_date: durationMode === "date" && endDate ? endDate : undefined,
    });
    setName("");
    setOpen(false);
    setDurationMode("forever");
  };

  return (
    <form className="habit-form" onSubmit={submit}>
      <div className="habit-form-top">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("habit.new")}
          onFocus={() => setOpen(true)}
        />
        <button type="submit">{t("common.add")}</button>
      </div>

      {open && (
        <div className="habit-form-opts">
          <div className="opt">
            <label>{t("habit.frequency")}</label>
            <div className="seg">
              <button
                type="button"
                className={frequency === "daily" ? "active" : ""}
                onClick={() => setFrequency("daily")}
              >
                {t("habit.daily")}
              </button>
              <button
                type="button"
                className={frequency === "weekly" ? "active" : ""}
                onClick={() => setFrequency("weekly")}
              >
                {t("habit.weeklyN")}
              </button>
            </div>
            {frequency === "weekly" && (
              <div className="times">
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={timesPerWeek}
                  onChange={(e) => setTimesPerWeek(Math.min(7, Math.max(1, +e.target.value)))}
                />
                <span>{t("habit.timesPerWeek")}</span>
              </div>
            )}
          </div>

          <div className="opt">
            <label>{t("habit.duration")}</label>
            <div className="seg">
              <button
                type="button"
                className={durationMode === "forever" ? "active" : ""}
                onClick={() => setDurationMode("forever")}
              >
                {t("habit.forever")}
              </button>
              <button
                type="button"
                className={durationMode === "days" ? "active" : ""}
                onClick={() => setDurationMode("days")}
              >
                {t("habit.dayCount")}
              </button>
              <button
                type="button"
                className={durationMode === "date" ? "active" : ""}
                onClick={() => setDurationMode("date")}
              >
                {t("habit.untilDate")}
              </button>
            </div>
            {durationMode === "days" && (
              <div className="times">
                <input
                  type="number"
                  min={1}
                  value={durationDays}
                  onChange={(e) => setDurationDays(Math.max(1, +e.target.value))}
                />
                <span>{t("habit.days")}</span>
                <div className="preset">
                  {[21, 30, 66, 100].map((n) => (
                    <button type="button" key={n} onClick={() => setDurationDays(n)}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {durationMode === "date" && (
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            )}
          </div>
        </div>
      )}
    </form>
  );
}

// -------- Sahifa --------

export function HabitsPage({ habits, onCreate, onToggle, onDelete }: Props) {
  const t = useT();
  const todayKey = ymd(new Date());
  const [statsFor, setStatsFor] = useState<string | null>(null);

  return (
    <div className="page habits-page">
      <div className="page-head">
        <h2>{t("habit.title")}</h2>
      </div>

      <CreateForm onCreate={onCreate} />

      <div className="habit-list">
        {habits.length === 0 && <div className="empty">{t("habit.empty")}</div>}
        {habits.map((h) => {
          const set = new Set(h.days);
          const st = streak(set);
          const wc = weekCount(set);
          const prog = durationProgress(h);
          const freqLabel =
            h.frequency === "weekly" ? t("habit.weeklyLabel", { n: h.target_per_week }) : t("habit.daily");
          return (
            <div key={h.id} className="habit-card">
              <div className="habit-info">
                <span className="habit-dot" style={{ background: h.color }} />
                <span className="habit-name">{h.name}</span>
                <span className="habit-freq">{freqLabel}</span>
                <span className="habit-streak" title={t("habit.streakTitle")}>🔥 {st}</span>
                {h.frequency === "weekly" && (
                  <span className="habit-week" title={t("habit.thisWeek")}>
                    {wc}/{h.target_per_week}
                  </span>
                )}
                <button
                  className={`habit-stats-btn ${statsFor === h.id ? "active" : ""}`}
                  title={t("habit.statsTitle")}
                  onClick={() => setStatsFor((v) => (v === h.id ? null : h.id))}
                >
                  📊
                </button>
                <button className="habit-del" title={t("common.delete")} onClick={() => onDelete(h.id)}>×</button>
              </div>

              {prog && (
                <div className="habit-progress">
                  <div className="habit-bar">
                    <div
                      className="habit-bar-fill"
                      style={{ width: `${prog.percent}%`, background: h.color }}
                    />
                  </div>
                  <span className="habit-prog-label">
                    {t("habit.progressLabel", { done: prog.doneDays, total: prog.total, percent: prog.percent })}
                  </span>
                </div>
              )}

              <div className="habit-strip">
                {habitDays(h).map((d) => {
                  const key = ymd(d);
                  const done = set.has(key);
                  const isToday = key === todayKey;
                  const isFuture = key > todayKey;
                  // Faqat bugungi kunga belgi qo'yish mumkin
                  return (
                    <button
                      key={key}
                      disabled={!isToday}
                      className={`habit-day ${done ? "done" : ""} ${isToday ? "today" : ""} ${
                        isFuture ? "future" : ""
                      } ${!isToday ? "locked" : ""}`}
                      style={done ? { background: h.color, borderColor: h.color } : undefined}
                      title={isToday ? key : t("habit.onlyToday", { key })}
                      onClick={() => isToday && onToggle(h.id, key)}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>

              {statsFor === h.id && (
                <div className="habit-stats">
                  <div className="habit-stats-row">
                    <div className="hs-tile">
                      <div className="hs-num">🔥 {st}</div>
                      <div className="hs-lbl">{t("habit.curStreak")}</div>
                    </div>
                    <div className="hs-tile">
                      <div className="hs-num">🏆 {longestStreak(h.days)}</div>
                      <div className="hs-lbl">{t("habit.longStreak")}</div>
                    </div>
                    <div className="hs-tile">
                      <div className="hs-num">✅ {h.days.length}</div>
                      <div className="hs-lbl">{t("habit.totalDays")}</div>
                    </div>
                  </div>
                  <div className="heatmap" title={t("habit.last3mo")}>
                    {(() => {
                      const cells = heatmapDays(set);
                      const weeks: typeof cells[] = [];
                      for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
                      return weeks.map((wk, wi) => (
                        <div key={wi} className="heat-col">
                          {wk.map((c) => (
                            <span
                              key={c.key}
                              className={`heat-cell ${c.done ? "done" : ""} ${c.future ? "future" : ""}`}
                              style={c.done ? { background: h.color } : undefined}
                              title={c.key}
                            />
                          ))}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
