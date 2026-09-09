import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";

type Mode = "work" | "short" | "long";

const DURATIONS: Record<Mode, number> = {
  work: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
};

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    o.start();
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.stop(ctx.currentTime + 0.6);
  } catch {
    /* ovoz ishlamasa ham mayli */
  }
}

export function PomodoroPage() {
  const t = useT();
  const [mode, setMode] = useState<Mode>("work");
  const [left, setLeft] = useState(DURATIONS.work);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const tick = useRef<number | null>(null);

  // Bugungi tugatilgan fokus sessiyalarini serverdan yuklaymiz
  useEffect(() => {
    api.pomodoroStats().then((s) => setCompleted(s.today)).catch(() => {});
  }, []);

  const switchMode = (m: Mode) => {
    setMode(m);
    setLeft(DURATIONS[m]);
    setRunning(false);
  };

  // Sessiya tugadi
  const finish = () => {
    beep();
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("🍅 Pomodoro", {
        body: mode === "work" ? t("pomo.workDone") : t("pomo.breakDone"),
      });
    }
    if (mode === "work") {
      const c = completed + 1;
      setCompleted(c);
      // Tugatilgan fokus sessiyasini serverga yozamiz (statistika uchun)
      api.recordPomodoro({ kind: "work", seconds: DURATIONS.work }).catch(() => {});
      switchMode(c % 4 === 0 ? "long" : "short");
    } else {
      switchMode("work");
    }
  };

  useEffect(() => {
    if (!running) return;
    tick.current = window.setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [running]);

  useEffect(() => {
    if (left === 0 && running) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const progress = 1 - left / DURATIONS[mode];

  return (
    <div className="page pomodoro-page">
      <div className="page-head">
        <h2>{t("pomo.title")}</h2>
        <span className="page-hint">{t("pomo.todayDone", { n: completed })}</span>
      </div>

      <div className={`pomo-card mode-${mode}`}>
        <div className="pomo-tabs">
          {(["work", "short", "long"] as Mode[]).map((m) => (
            <button
              key={m}
              className={mode === m ? "active" : ""}
              onClick={() => switchMode(m)}
            >
              {t(`pomo.${m}`)}
            </button>
          ))}
        </div>

        <div className="pomo-ring" style={{ ["--p" as any]: progress }}>
          <div className="pomo-time">
            {mm}:{ss}
          </div>
        </div>

        <div className="pomo-controls">
          <button className="pomo-main" onClick={() => setRunning((r) => !r)}>
            {running ? t("pomo.pause") : t("pomo.start")}
          </button>
          <button className="pomo-reset" onClick={() => switchMode(mode)}>
            {t("pomo.reset")}
          </button>
        </div>
      </div>
    </div>
  );
}
