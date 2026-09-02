import { useEffect, useState } from "react";
import { api, setUnauthorizedHandler, tokenStore } from "./api";
import type { User } from "./types";
import { AuthScreen } from "./components/AuthScreen";
import Workspace from "./Workspace";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  const logout = () => {
    tokenStore.clear();
    setUser(null);
  };

  // 401 kelsa avtomatik chiqish
  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, []);

  // Saqlangan token bo'lsa — uni tekshiramiz
  useEffect(() => {
    if (!tokenStore.get()) {
      setChecking(false);
      return;
    }
    api
      .me()
      .then((u) => setUser(u))
      .catch(() => tokenStore.clear())
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return <div className="loading">Yuklanmoqda…</div>;
  }

  if (!user) {
    return <AuthScreen onAuth={setUser} />;
  }

  return <Workspace user={user} onLogout={logout} />;
}
