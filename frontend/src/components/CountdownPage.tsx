import { useEffect, useState } from "react";

interface Countdown {
  id: string;
  title: string;
  target: string; // ISO
}

const KEY = "challanger_countdowns";

function load(): Countdown[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
function save(list: Countdown[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

function remaining(target: string) {
  const diff = new Date(target).getTime() - Date.now();
  const past = diff < 0;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  const secs = Math.floor((abs % 60000) / 1000);
  return { past, days, hours, mins, secs };
}

export function CountdownPage() {
  const [items, setItems] = useState<Countdown[]>(load);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [, forceTick] = useState(0);

  // Har soniyada yangilash
  useEffect(() => {
    const id = setInterval(() => forceTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !target) return;
    const next = [
      ...items,
      { id: crypto.randomUUID(), title: title.trim(), target: new Date(target).toISOString() },
    ].sort((a, b) => +new Date(a.target) - +new Date(b.target));
    setItems(next);
    save(next);
    setTitle("");
    setTarget("");
  };

  const remove = (id: string) => {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    save(next);
  };

  return (
    <div className="page countdown-page">
      <div className="page-head">
        <h2>Sanoq (countdown)</h2>
      </div>

      <form className="cd-add" onSubmit={add}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Voqea nomi (masalan: Tug'ilgan kun)"
        />
        <input type="datetime-local" value={target} onChange={(e) => setTarget(e.target.value)} />
        <button type="submit">Qo'shish</button>
      </form>

      <div className="cd-list">
        {items.length === 0 && <div className="empty">Hali sanoq yo'q ⏳</div>}
        {items.map((c) => {
          const r = remaining(c.target);
          return (
            <div key={c.id} className={`cd-card ${r.past ? "past" : ""}`}>
              <div className="cd-info">
                <div className="cd-title">{c.title}</div>
                <div className="cd-date">
                  {new Date(c.target).toLocaleString("uz", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <div className="cd-time">
                {r.past && <span className="cd-past-label">o'tdi</span>}
                <div className="cd-units">
                  <span><b>{r.days}</b>kun</span>
                  <span><b>{r.hours}</b>soat</span>
                  <span><b>{r.mins}</b>daq</span>
                  <span><b>{r.secs}</b>son</span>
                </div>
              </div>
              <button className="cd-del" onClick={() => remove(c.id)} title="O'chirish">×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
