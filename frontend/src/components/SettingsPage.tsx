import { useState } from "react";
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

  // --- Hisobni o'chirish ---
  const [confirmDelete, setConfirmDelete] = useState(false);

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
          {(["system", "light", "dark"] as Theme[]).map((t) => (
            <button
              key={t}
              type="button"
              className={theme === t ? "active" : ""}
              onClick={() => chooseTheme(t)}
            >
              {t === "system" ? "Tizim" : t === "light" ? "Yorug'" : "Qorong'i"}
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
