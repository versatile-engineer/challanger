import { useState } from "react";
import { api, tokenStore } from "../api";
import type { User } from "../types";

interface Props {
  onAuth: (user: User) => void;
}

type Mode = "login" | "signup";

export function AuthScreen({ onAuth }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === "signup"
          ? await api.signup({ username, email, password })
          : await api.login({ email, password });
      tokenStore.set(res.token);
      onAuth(res.user);
    } catch (err: any) {
      setError(String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="auth-logo">✓ Challanger</h1>
        <p className="auth-sub">
          {mode === "login" ? "Hisobingizga kiring" : "Yangi hisob yarating"}
        </p>

        {mode === "signup" && (
          <label className="auth-field">
            <span>Foydalanuvchi nomi</span>
            <input
              value={username}
              onChange={(e) =>
                // Faqat kichik harflar va raqamlar (bo'sh joy va boshqa belgilar olib tashlanadi)
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))
              }
              placeholder="rustacean"
              minLength={3}
              maxLength={20}
              required
              autoFocus
            />
            <small className="auth-hint">
              Faqat kichik harflar va raqamlar · noyob bo'lishi kerak
            </small>
          </label>
        )}

        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="siz@example.com"
            required
            autoFocus={mode === "login"}
          />
        </label>

        <label className="auth-field">
          <span>Parol</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="kamida 6 ta belgi"
            minLength={6}
            required
          />
        </label>

        {error && <div className="auth-error">⚠️ {error}</div>}

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Kirish" : "Ro'yxatdan o'tish"}
        </button>

        <div className="auth-switch">
          {mode === "login" ? (
            <>
              Hisobingiz yo'qmi?{" "}
              <button type="button" onClick={() => { setMode("signup"); setError(null); }}>
                Ro'yxatdan o'tish
              </button>
            </>
          ) : (
            <>
              Hisobingiz bormi?{" "}
              <button type="button" onClick={() => { setMode("login"); setError(null); }}>
                Kirish
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
