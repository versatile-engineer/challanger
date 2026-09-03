import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { User } from "../types";
import { getTheme, setTheme, type Theme } from "../theme";

interface Props {
  user: User;
  onUserUpdate: (u: User) => void;
  onLogout: () => void;
}

type Msg = { kind: "ok" | "err"; text: string } | null;

export function SettingsPage({ user, onUserUpdate, onLogout }: Props) {
  // --- Profil ---
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [profileMsg, setProfileMsg] = useState<Msg>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // --- Parol ---
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passMsg, setPassMsg] = useState<Msg>(null);
  const [savingPass, setSavingPass] = useState(false);

  // --- Mavzu ---
  const [theme, setThemeState] = useState<Theme>(getTheme());

  // --- Bildirishnoma ---
  const [notif, setNotif] = useState<NotificationPermission | "unsupported">(
    "Notification" in window ? Notification.permission : "unsupported"
  );

  // --- Telegram ---
  const [tg, setTg] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [tgLink, setTgLink] = useState<string | null>(null);
  const [tgBusy, setTgBusy] = useState(false);

  useEffect(() => {
    api.telegramStatus().then(setTg).catch(() => setTg(null));
  }, []);

  const connectTelegram = async () => {
    setTgBusy(true);
    try {
      const res = await api.telegramLink();
      setTgLink(res.deep_link);
      window.open(res.deep_link, "_blank");
      // Bir necha soniyadan so'ng holatni qayta tekshiramiz (bot ulagan bo'lsa)
      setTimeout(() => api.telegramStatus().then(setTg).catch(() => {}), 4000);
    } catch {
      /* xato — jim o'tamiz */
    } finally {
      setTgBusy(false);
    }
  };

  const refreshTelegram = () => api.telegramStatus().then(setTg).catch(() => {});

  const disconnectTelegram = async () => {
    setTgBusy(true);
    try {
      await api.telegramUnlink();
      setTgLink(null);
      setTg((s) => (s ? { ...s, connected: false } : s));
    } finally {
      setTgBusy(false);
    }
  };

  // --- Ma'lumot eksport/import ---
  const [dataMsg, setDataMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // --- Hisobni o'chirish ---
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exportData = async () => {
    setDataMsg(null);
    setBusy(true);
    try {
      const [projects, tasks, habits, subtasks] = await Promise.all([
        api.listProjects(),
        api.listTasks({}),
        api.listHabits(),
        api.listSubtasks(),
      ]);
      const dump = { version: 1, exported_at: new Date().toISOString(), projects, tasks, habits, subtasks };
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `challanger-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDataMsg({ kind: "ok", text: "Ma'lumotlar yuklab olindi ✓" });
    } catch (err: any) {
      setDataMsg({ kind: "err", text: String(err.message ?? err) });
    } finally {
      setBusy(false);
    }
  };

  const importData = async (file: File) => {
    setDataMsg(null);
    setBusy(true);
    try {
      const dump = JSON.parse(await file.text());
      // Loyihalar — eski id -> yangi id
      const projMap = new Map<string, string>();
      for (const p of dump.projects ?? []) {
        const created = await api.createProject({ name: p.name, color: p.color });
        projMap.set(p.id, created.id);
      }
      // Vazifalar — eski id -> yangi id
      const taskMap = new Map<string, string>();
      for (const t of dump.tasks ?? []) {
        const created = await api.createTask({
          title: t.title,
          notes: t.notes ?? "",
          due_date: t.due_date ?? null,
          priority: t.priority ?? 0,
          recurrence: t.recurrence ?? null,
          reminder_at: t.reminder_at ?? null,
          project_id: t.project_id ? projMap.get(t.project_id) ?? null : null,
          tags: t.tags ?? [],
        } as any);
        taskMap.set(t.id, created.id);
        if (t.completed || t.eisenhower != null) {
          await api.updateTask(created.id, {
            ...(t.completed ? { completed: true } : {}),
            ...(t.eisenhower != null ? { eisenhower: t.eisenhower } : {}),
          });
        }
      }
      // Kichik qadamlar
      for (const s of dump.subtasks ?? []) {
        const newTaskId = taskMap.get(s.task_id);
        if (!newTaskId) continue;
        const created = await api.createSubtask(newTaskId, s.title);
        if (s.done) await api.updateSubtask(created.id, { done: true });
      }
      // Odatlar
      for (const h of dump.habits ?? []) {
        await api.createHabit({
          name: h.name,
          color: h.color,
          frequency: h.frequency,
          target_per_week: h.target_per_week,
          duration_days: h.duration_days ?? undefined,
          end_date: h.end_date ?? undefined,
        });
      }
      setDataMsg({ kind: "ok", text: "Import tugadi ✓ — sahifani yangilang" });
    } catch (err: any) {
      setDataMsg({ kind: "err", text: `Import xatosi: ${String(err.message ?? err)}` });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const profileChanged = username !== user.username || email !== user.email;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      const updated = await api.updateProfile({ username, email });
      onUserUpdate(updated);
      setUsername(updated.username);
      setEmail(updated.email);
      setProfileMsg({ kind: "ok", text: "Profil saqlandi ✓" });
    } catch (err: any) {
      setProfileMsg({ kind: "err", text: String(err.message ?? err) });
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    if (newPass !== confirmPass) {
      setPassMsg({ kind: "err", text: "Yangi parollar mos kelmadi" });
      return;
    }
    setSavingPass(true);
    try {
      await api.changePassword({ current_password: curPass, new_password: newPass });
      setCurPass("");
      setNewPass("");
      setConfirmPass("");
      setPassMsg({ kind: "ok", text: "Parol o'zgartirildi ✓" });
    } catch (err: any) {
      setPassMsg({ kind: "err", text: String(err.message ?? err) });
    } finally {
      setSavingPass(false);
    }
  };

  const chooseTheme = (t: Theme) => {
    setTheme(t);
    setThemeState(t);
  };

  const requestNotif = async () => {
    if (!("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setNotif(p);
  };

  const deleteAccount = async () => {
    try {
      await api.deleteAccount();
      onLogout();
    } catch {
      /* onLogout baribir chaqiriladi */
      onLogout();
    }
  };

  return (
    <div className="page settings-page">
      <div className="page-head">
        <h2>Sozlamalar</h2>
      </div>

      {/* Profil */}
      <section className="card">
        <h3>Profil</h3>
        <form onSubmit={saveProfile} className="settings-form">
          <label className="settings-field">
            <span>Foydalanuvchi nomi</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
              minLength={3}
              maxLength={20}
              required
            />
            <small>Faqat kichik harflar va raqamlar · noyob</small>
          </label>
          <label className="settings-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {profileMsg && <div className={`settings-msg ${profileMsg.kind}`}>{profileMsg.text}</div>}
          <button type="submit" className="btn-primary" disabled={!profileChanged || savingProfile}>
            {savingProfile ? "…" : "Saqlash"}
          </button>
        </form>
      </section>

      {/* Parol */}
      <section className="card">
        <h3>Parolni o'zgartirish</h3>
        <form onSubmit={savePassword} className="settings-form">
          <label className="settings-field">
            <span>Joriy parol</span>
            <input type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} required />
          </label>
          <label className="settings-field">
            <span>Yangi parol</span>
            <input
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              minLength={6}
              required
            />
          </label>
          <label className="settings-field">
            <span>Yangi parolni tasdiqlang</span>
            <input
              type="password"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              minLength={6}
              required
            />
          </label>
          {passMsg && <div className={`settings-msg ${passMsg.kind}`}>{passMsg.text}</div>}
          <button type="submit" className="btn-primary" disabled={savingPass}>
            {savingPass ? "…" : "Parolni yangilash"}
          </button>
        </form>
      </section>

      {/* Ko'rinish */}
      <section className="card">
        <h3>Ko'rinish (mavzu)</h3>
        <div className="seg">
          {(["system", "light", "dark", "gruvbox"] as Theme[]).map((t) => (
            <button
              key={t}
              type="button"
              className={theme === t ? "active" : ""}
              onClick={() => chooseTheme(t)}
            >
              {t === "system"
                ? "Tizim"
                : t === "light"
                ? "Yorug'"
                : t === "dark"
                ? "Qorong'i"
                : "Gruvbox"}
            </button>
          ))}
        </div>
      </section>

      {/* Bildirishnoma */}
      <section className="card">
        <h3>Bildirishnomalar</h3>
        {notif === "unsupported" ? (
          <p className="settings-note">Brauzeringiz bildirishnomani qo'llab-quvvatlamaydi.</p>
        ) : notif === "granted" ? (
          <p className="settings-note">✅ Bildirishnomalar yoqilgan (eslatmalar ishlaydi).</p>
        ) : (
          <div className="settings-inline">
            <p className="settings-note">
              {notif === "denied"
                ? "Bloklangan — brauzer sozlamalaridan ruxsat bering."
                : "Eslatmalar uchun ruxsat kerak."}
            </p>
            <button className="btn-secondary" onClick={requestNotif} disabled={notif === "denied"}>
              Ruxsat berish
            </button>
          </div>
        )}
      </section>

      {/* Telegram */}
      <section className="card">
        <h3>Telegram eslatmalari</h3>
        {tg === null ? (
          <p className="settings-note">Yuklanmoqda…</p>
        ) : !tg.configured ? (
          <p className="settings-note">
            Serverda Telegram bot sozlanmagan. Administrator <code>TELEGRAM_BOT_TOKEN</code> ni
            o'rnatishi kerak.
          </p>
        ) : tg.connected ? (
          <div className="settings-inline">
            <p className="settings-note">
              ✅ Telegram ulangan — vazifa eslatmalari botga yuboriladi.
            </p>
            <button className="btn-secondary" onClick={disconnectTelegram} disabled={tgBusy}>
              Uzish
            </button>
          </div>
        ) : (
          <div className="settings-form">
            <p className="settings-note">
              Botga ulaning — belgilangan eslatma vaqtida vazifalaringiz Telegram'ga xabar bo'lib
              keladi.
            </p>
            <div className="settings-inline">
              <span className="settings-note">
                Tugmani bosing, bot ochiladi va <b>Start</b> ni bosing.
              </span>
              <div className="confirm-row">
                <button className="btn-primary" onClick={connectTelegram} disabled={tgBusy}>
                  {tgBusy ? "…" : "Telegram'ni ulash"}
                </button>
                <button className="btn-secondary" onClick={refreshTelegram} disabled={tgBusy}>
                  ⟳ Tekshirish
                </button>
              </div>
            </div>
            {tgLink && (
              <small className="settings-note">
                Ochilmadimi? Havola:{" "}
                <a href={tgLink} target="_blank" rel="noreferrer">
                  {tgLink}
                </a>{" "}
                <br />
                Botda Start bosgach, <b>⟳ Tekshirish</b> tugmasini bosing.
              </small>
            )}
          </div>
        )}
      </section>

      {/* Ma'lumotlar */}
      <section className="card">
        <h3>Ma'lumotlar (zaxira)</h3>
        {dataMsg && <div className={`settings-msg ${dataMsg.kind}`}>{dataMsg.text}</div>}
        <div className="settings-inline">
          <span className="settings-note">
            Barcha vazifa, loyiha, odat va qadamlarni JSON faylga yuklab oling yoki qayta tiklang.
          </span>
          <div className="confirm-row">
            <button className="btn-secondary" onClick={exportData} disabled={busy}>
              ⬇ Eksport
            </button>
            <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              ⬆ Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importData(f);
              }}
            />
          </div>
        </div>
        {busy && <p className="settings-note">⏳ Bajarilmoqda…</p>}
      </section>

      {/* Hisob */}
      <section className="card danger-zone">
        <h3>Hisob</h3>
        <div className="settings-inline">
          <span className="settings-note">Tizimdan chiqish</span>
          <button className="btn-secondary" onClick={onLogout}>Chiqish ⎋</button>
        </div>
        <hr />
        <div className="settings-inline">
          <span className="settings-note">
            Hisobni o'chirish — barcha vazifa, loyiha va odatlaringiz butunlay o'chadi.
          </span>
          {!confirmDelete ? (
            <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
              Hisobni o'chirish
            </button>
          ) : (
            <div className="confirm-row">
              <button className="btn-danger" onClick={deleteAccount}>Ha, o'chirish</button>
              <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>Bekor</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
