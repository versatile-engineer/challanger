import { useEffect, useState } from "react";
import { api } from "../api";
import type { GroupDetail, GroupSummary, User } from "../types";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/// Shu haftaning kunlari (dushanbadan bugungacha)
function weekDaysSoFar(): string[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const out: string[] = [];
  for (let t = monday.getTime(); t <= now.getTime(); t += 86400000) out.push(ymd(new Date(t)));
  return out;
}

/// O'tgan haftaning to'liq kunlari (dushanba–yakshanba)
function prevWeekDays(): string[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const lastMonday = new Date(thisMonday.getTime() - 7 * 86400000);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(ymd(new Date(lastMonday.getTime() + i * 86400000)));
  return out;
}

export function GroupsPage({ user }: { user: User }) {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const loadGroups = () =>
    api.listGroups().then(setGroups).catch((e) => setError(String(e.message ?? e)));

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    api.getGroup(selectedId).then(setDetail).catch((e) => setError(String(e.message ?? e)));
  }, [selectedId]);

  const refreshDetail = () =>
    selectedId && api.getGroup(selectedId).then(setDetail).catch(() => {});

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const g = await api.createGroup(newName.trim());
      setNewName("");
      await loadGroups();
      setSelectedId(g.id);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const joinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    try {
      const r = await api.joinGroup(joinCode.trim());
      setJoinCode("");
      await loadGroups();
      setSelectedId(r.group_id);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  if (selectedId && detail) {
    return (
      <GroupDetailView
        detail={detail}
        user={user}
        onBack={() => {
          setSelectedId(null);
          loadGroups();
        }}
        onChanged={refreshDetail}
        onLeftOrDeleted={() => {
          setSelectedId(null);
          loadGroups();
        }}
        setError={setError}
        error={error}
      />
    );
  }

  return (
    <div className="page groups-page">
      <div className="page-head">
        <h2>Jamoa</h2>
        <span className="page-hint">Odatlarni birga bajaring</span>
      </div>

      {error && (
        <div className="error-bar" onClick={() => setError(null)}>⚠️ {error}</div>
      )}

      <div className="group-actions">
        <form onSubmit={createGroup} className="group-action-card">
          <label>Yangi guruh yaratish</label>
          <div className="row">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Guruh nomi" />
            <button type="submit" className="btn-primary">Yaratish</button>
          </div>
        </form>
        <form onSubmit={joinGroup} className="group-action-card">
          <label>Taklif kodi bilan qo'shilish</label>
          <div className="row">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Masalan: 2ECC26D9"
            />
            <button type="submit" className="btn-secondary">Qo'shilish</button>
          </div>
        </form>
      </div>

      <div className="group-list">
        {groups.length === 0 && <div className="empty">Hali guruh yo'q. Yarating yoki qo'shiling 👥</div>}
        {groups.map((g) => (
          <button key={g.id} className="group-card" onClick={() => setSelectedId(g.id)}>
            <div className="group-card-main">
              <span className="group-name">{g.name}</span>
              <span className="group-meta">
                {g.member_count} a'zo · {g.role === "owner" ? "egasi" : "a'zo"}
              </span>
            </div>
            <span className="group-arrow">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ================= Tafsilot + Statistika =================

interface DetailProps {
  detail: GroupDetail;
  user: User;
  onBack: () => void;
  onChanged: () => void;
  onLeftOrDeleted: () => void;
  setError: (s: string | null) => void;
  error: string | null;
}

function GroupDetailView({ detail, user, onBack, onChanged, onLeftOrDeleted, setError, error }: DetailProps) {
  const [tab, setTab] = useState<"habits" | "tasks" | "stats" | "activity" | "members">("habits");
  const [habitName, setHabitName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [taskName, setTaskName] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  const isOwner = detail.owner_id === user.id;
  const today = ymd(new Date());
  const week = weekDaysSoFar();
  const nameOf = (uid: string | null) =>
    uid ? detail.members.find((m) => m.user_id === uid)?.username ?? "?" : "?";

  const addHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!habitName.trim()) return;
    try {
      await api.createGroupHabit(detail.id, { name: habitName.trim() });
      setHabitName("");
      onChanged();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const toggleHabit = async (hid: string) => {
    try {
      await api.toggleGroupHabit(hid, today);
      onChanged();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const deleteHabit = async (hid: string) => {
    try {
      await api.deleteGroupHabit(detail.id, hid);
      onChanged();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const react = async (hid: string, emoji: string) => {
    try {
      await api.reactGroupHabit(hid, emoji);
      onChanged();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim()) return;
    try {
      await api.createGroupTask(detail.id, taskName.trim());
      setTaskName("");
      onChanged();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const toggleTask = async (tid: string) => {
    try {
      await api.toggleGroupTask(tid);
      onChanged();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const deleteTask = async (tid: string) => {
    try {
      await api.deleteGroupTask(tid);
      onChanged();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = memberName.trim().toLowerCase();
    if (!u) return;
    try {
      await api.addGroupMember(detail.id, u);
      setMemberName("");
      onChanged();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const removeMember = async (uid: string) => {
    try {
      await api.removeGroupMember(detail.id, uid);
      onChanged();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const [copied, setCopied] = useState(false);
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(detail.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard yo'q — e'tiborsiz qoldiramiz */
    }
  };

  const leaveOrDelete = async () => {
    try {
      if (isOwner) await api.deleteGroup(detail.id);
      else await api.leaveGroup(detail.id);
      onLeftOrDeleted();
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  };

  const doneToday = (hid: string) => {
    const h = detail.habits.find((x) => x.id === hid)!;
    return detail.members.filter((m) => (h.entries[m.user_id] ?? []).includes(today)).length;
  };
  const iDidToday = (hid: string) => {
    const h = detail.habits.find((x) => x.id === hid)!;
    return (h.entries[user.id] ?? []).includes(today);
  };

  // --- Statistika hisoblari ---
  // Har a'zo uchun shu haftadagi bajarishlar soni (barcha odatlar bo'yicha)
  const leaderboard = detail.members
    .map((m) => {
      let count = 0;
      for (const h of detail.habits) {
        const days = new Set(h.entries[m.user_id] ?? []);
        for (const d of week) if (days.has(d)) count++;
      }
      return { ...m, count };
    })
    .sort((a, b) => b.count - a.count);

  const possible = detail.members.length * detail.habits.length * week.length;
  const totalDone = leaderboard.reduce((s, m) => s + m.count, 0);
  const rate = possible ? Math.round((totalDone / possible) * 100) : 0;
  const maxCount = leaderboard[0]?.count || 1;

  // O'tgan hafta bilan solishtirish
  const prevWeek = prevWeekDays();
  const prevTotal = detail.members.reduce((sum, m) => {
    let c = 0;
    for (const h of detail.habits) {
      const days = new Set(h.entries[m.user_id] ?? []);
      for (const d of prevWeek) if (days.has(d)) c++;
    }
    return sum + c;
  }, 0);
  const delta = totalDone - prevTotal;

  return (
    <div className="page group-detail">
      <div className="page-head">
        <div className="gd-title">
          <button className="btn-back" onClick={onBack}>‹ Guruhlar</button>
          <h2>{detail.name}</h2>
        </div>
        <button className="gd-code" onClick={copyCode} title="Nusxalash uchun bosing">
          🔑 {detail.invite_code}
          <span className="gd-code-hint">{copied ? "nusxalandi ✓" : "nusxalash"}</span>
        </button>
      </div>

      {error && <div className="error-bar" onClick={() => setError(null)}>⚠️ {error}</div>}

      <div className="seg gd-tabs">
        <button className={tab === "habits" ? "active" : ""} onClick={() => setTab("habits")}>Odatlar</button>
        <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>
          Vazifalar ({detail.tasks.filter((t) => !t.done).length})
        </button>
        <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}>Statistika</button>
        <button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Faoliyat</button>
        <button className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}>
          A'zolar ({detail.members.length})
        </button>
      </div>

      {/* ---- Odatlar ---- */}
      {tab === "habits" && (
        <div className="gd-section">
          <form className="habit-form-top gd-add" onSubmit={addHabit}>
            <input value={habitName} onChange={(e) => setHabitName(e.target.value)} placeholder="+ Jamoaviy odat qo'shish" />
            <button type="submit">Qo'shish</button>
          </form>

          {detail.habits.length === 0 && <div className="empty">Hali jamoaviy odat yo'q 🔥</div>}
          {detail.habits.map((h) => {
            const dt = doneToday(h.id);
            const mine = iDidToday(h.id);
            return (
              <div key={h.id} className="gh-card">
                <div className="gh-head">
                  <span className="habit-dot" style={{ background: h.color }} />
                  <span className="gh-name">{h.name}</span>
                  <span className="gh-today">{dt}/{detail.members.length} bugun</span>
                  {isOwner && (
                    <button className="habit-del" onClick={() => deleteHabit(h.id)} title="O'chirish">×</button>
                  )}
                </div>
                <div className="gh-bar">
                  <div
                    className="gh-bar-fill"
                    style={{ width: `${(dt / Math.max(1, detail.members.length)) * 100}%`, background: h.color }}
                  />
                </div>
                <div className="gh-row">
                  <div className="gh-members">
                    {detail.members.map((m) => {
                      const did = (h.entries[m.user_id] ?? []).includes(today);
                      return (
                        <span
                          key={m.user_id}
                          className={`gh-avatar ${did ? "did" : ""}`}
                          style={did ? { background: h.color } : undefined}
                          title={`${m.username}${did ? " ✓" : ""}`}
                        >
                          {m.username.charAt(0).toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                  <button
                    className={`gh-toggle ${mine ? "done" : ""}`}
                    style={mine ? { background: h.color, borderColor: h.color } : undefined}
                    onClick={() => toggleHabit(h.id)}
                  >
                    {mine ? "✓ Bajarildi" : "Men bajardim"}
                  </button>
                </div>
                <div className="gh-reactions">
                  {["👍", "🔥", "👏", "💪"].map((emoji) => {
                    const count = h.reactions?.[emoji] ?? 0;
                    const active = (h.my_reactions ?? []).includes(emoji);
                    return (
                      <button
                        key={emoji}
                        className={`reaction ${active ? "active" : ""}`}
                        onClick={() => react(h.id, emoji)}
                        title="Reaksiya"
                      >
                        {emoji}
                        {count > 0 && <span className="reaction-count">{count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- Umumiy vazifalar ---- */}
      {tab === "tasks" && (
        <div className="gd-section">
          <form className="habit-form-top gd-add" onSubmit={addTask}>
            <input
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="+ Umumiy vazifa qo'shish"
            />
            <button type="submit">Qo'shish</button>
          </form>
          {detail.tasks.length === 0 && <div className="empty">Hali umumiy vazifa yo'q ✅</div>}
          <div className="gtask-list">
            {detail.tasks.map((t) => (
              <div key={t.id} className={`gtask-row ${t.done ? "done" : ""}`}>
                <button className="gtask-check" onClick={() => toggleTask(t.id)}>
                  {t.done ? "✓" : ""}
                </button>
                <span className="gtask-title">{t.title}</span>
                {t.done && t.done_by && (
                  <span className="gtask-by">— {nameOf(t.done_by)}</span>
                )}
                <button className="gtask-del" onClick={() => deleteTask(t.id)} title="O'chirish">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Faoliyat (bildirishnoma tasmasi) ---- */}
      {tab === "activity" && (
        <div className="gd-section">
          {detail.activity.length === 0 && <div className="empty">Hali faoliyat yo'q 🔔</div>}
          <div className="activity-feed">
            {detail.activity.map((a) => (
              <div key={a.id} className="activity-row">
                <span className="activity-text">{a.text}</span>
                <span className="activity-time">
                  {new Date(a.created_at).toLocaleString("uz", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Statistika ---- */}
      {tab === "stats" && (
        <div className="gd-section">
          <div className="stat-tiles">
            <div className="stat-tile">
              <div className="stat-num">{rate}%</div>
              <div className="stat-label">Shu hafta bajarish darajasi</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num">{totalDone}</div>
              <div className="stat-label">Jami bajarishlar (hafta)</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num">{detail.habits.length}</div>
              <div className="stat-label">Jamoaviy odatlar</div>
            </div>
          </div>

          <div className="week-summary">
            <span>📈 Haftalik xulosa:</span>
            <span className="ws-cur">bu hafta {totalDone}</span>
            <span className="ws-prev">o'tgan hafta {prevTotal}</span>
            {delta !== 0 && (
              <span className={`ws-delta ${delta > 0 ? "up" : "down"}`}>
                {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
              </span>
            )}
            {delta === 0 && <span className="ws-delta">= barobar</span>}
          </div>

          <h3 className="stat-h">🏆 Reyting (shu hafta)</h3>
          <div className="leaderboard">
            {leaderboard.map((m, i) => (
              <div key={m.user_id} className="lb-row">
                <span className="lb-rank">{i + 1}</span>
                <span className="avatar sm">{m.username.charAt(0).toUpperCase()}</span>
                <span className="lb-name">
                  {m.username}
                  {m.user_id === user.id && " (siz)"}
                </span>
                <div className="lb-bar">
                  <div className="lb-bar-fill" style={{ width: `${(m.count / maxCount) * 100}%` }} />
                </div>
                <span className="lb-count">{m.count}</span>
              </div>
            ))}
          </div>

          <h3 className="stat-h">📊 Bugungi holat</h3>
          <div className="stat-list">
            {detail.habits.map((h) => {
              const dt = doneToday(h.id);
              return (
                <div key={h.id} className="stat-hrow">
                  <span className="habit-dot" style={{ background: h.color }} />
                  <span className="stat-hname">{h.name}</span>
                  <div className="gh-bar">
                    <div className="gh-bar-fill" style={{ width: `${(dt / Math.max(1, detail.members.length)) * 100}%`, background: h.color }} />
                  </div>
                  <span className="stat-hcount">{dt}/{detail.members.length}</span>
                </div>
              );
            })}
            {detail.habits.length === 0 && <div className="empty">Odat yo'q</div>}
          </div>
        </div>
      )}

      {/* ---- A'zolar ---- */}
      {tab === "members" && (
        <div className="gd-section">
          {isOwner && (
            <form className="habit-form-top gd-add" onSubmit={addMember}>
              <input
                value={memberName}
                onChange={(e) => setMemberName(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                placeholder="+ Username orqali a'zo qo'shish"
              />
              <button type="submit">Qo'shish</button>
            </form>
          )}
          <div className="member-list">
            {detail.members.map((m) => (
              <div key={m.user_id} className="member-row">
                <span className="avatar sm">{m.username.charAt(0).toUpperCase()}</span>
                <span className="member-name">{m.username}</span>
                {m.role === "owner" && <span className="member-badge">egasi</span>}
                {m.user_id === user.id && <span className="member-you">siz</span>}
                {isOwner && m.role !== "owner" && m.user_id !== user.id && (
                  <button
                    className="member-kick"
                    title="Guruhdan chiqarish"
                    onClick={() => removeMember(m.user_id)}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="gd-danger">
            {!confirmDel ? (
              <button className="btn-danger" onClick={() => setConfirmDel(true)}>
                {isOwner ? "Guruhni o'chirish" : "Guruhni tark etish"}
              </button>
            ) : (
              <div className="confirm-row">
                <button className="btn-danger" onClick={leaveOrDelete}>
                  {isOwner ? "Ha, o'chirish" : "Ha, chiqish"}
                </button>
                <button className="btn-secondary" onClick={() => setConfirmDel(false)}>Bekor</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
