import { useMemo, useState } from "react";
import { api } from "../api";
import type { Habit } from "../types";

interface Props {
  habits: Habit[];
  onCreate: (data: Parameters<typeof api.createHabit>[0]) => void;
  onToggle: (id: string, day: string) => void;
  onDelete: (id: string) => void;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lastDays(n: number): Date[] {
  const out: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) out.push(new Date(today.getTime() - i * 86400000));
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
          placeholder="+ Yangi odat (masalan: 30 daqiqa kitob)"
          onFocus={() => setOpen(true)}
        />
        <button type="submit">Qo'shish</button>
      </div>

      {open && (
        <div className="habit-form-opts">
          <div className="opt">
            <label>Chastota</label>
            <div className="seg">
              <button
                type="button"
                className={frequency === "daily" ? "active" : ""}
                onClick={() => setFrequency("daily")}
              >
                Har kuni
              </button>
              <button
                type="button"
                className={frequency === "weekly" ? "active" : ""}
                onClick={() => setFrequency("weekly")}
              >
                Haftada N marta
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
                <span>marta/hafta</span>
              </div>
            )}
          </div>

          <div className="opt">
            <label>Davomiylik</label>
            <div className="seg">
              <button
                type="button"
                className={durationMode === "forever" ? "active" : ""}
                onClick={() => setDurationMode("forever")}
              >
                Doimiy
              </button>
              <button
                type="button"
                className={durationMode === "days" ? "active" : ""}
                onClick={() => setDurationMode("days")}
              >
                Kun soni
              </button>
              <button
                type="button"
                className={durationMode === "date" ? "active" : ""}
                onClick={() => setDurationMode("date")}
              >
                Sanagacha
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
                <span>kun</span>
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
  const strip = useMemo(() => lastDays(14), []);
  const todayKey = ymd(new Date());

  return (
    <div className="page habits-page">
      <div className="page-head">
        <h2>Odatlar</h2>
      </div>

      <CreateForm onCreate={onCreate} />

      <div className="habit-list">
        {habits.length === 0 && <div className="empty">Hali odat yo'q. Birinchisini qo'shing! 🔥</div>}
        {habits.map((h) => {
          const set = new Set(h.days);
          const st = streak(set);
          const wc = weekCount(set);
          const prog = durationProgress(h);
          const freqLabel =
            h.frequency === "weekly" ? `Haftada ${h.target_per_week} marta` : "Har kuni";
          return (
            <div key={h.id} className="habit-card">
              <div className="habit-info">
                <span className="habit-dot" style={{ background: h.color }} />
                <span className="habit-name">{h.name}</span>
                <span className="habit-freq">{freqLabel}</span>
                <span className="habit-streak" title="Ketma-ket kunlar">🔥 {st}</span>
                {h.frequency === "weekly" && (
                  <span className="habit-week" title="Shu hafta">
                    {wc}/{h.target_per_week}
                  </span>
                )}
                <button className="habit-del" title="O'chirish" onClick={() => onDelete(h.id)}>×</button>
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
                    {prog.doneDays}/{prog.total} kun · {prog.percent}%
                  </span>
                </div>
              )}

              <div className="habit-strip">
                {strip.map((d) => {
                  const key = ymd(d);
                  const done = set.has(key);
                  return (
                    <button
                      key={key}
                      className={`habit-day ${done ? "done" : ""} ${key === todayKey ? "today" : ""}`}
                      style={done ? { background: h.color, borderColor: h.color } : undefined}
                      title={key}
                      onClick={() => onToggle(h.id, key)}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
