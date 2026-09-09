import { useEffect, useState } from "react";
import { api } from "../api";
import type { GroupDetail, GroupSummary, User } from "../types";
import { useT, getLang } from "../i18n";

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
  const t = useT();
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
        <h2>{t("groups.title")}</h2>
        <span className="page-hint">{t("groups.hint")}</span>
      </div>

      {error && (
        <div className="error-bar" onClick={() => setError(null)}>⚠️ {error}</div>
      )}

      <div className="group-actions">
        <form onSubmit={createGroup} className="group-action-card">
          <label>{t("groups.createNew")}</label>
          <div className="row">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("groups.groupName")} />
            <button type="submit" className="btn-primary">{t("groups.create")}</button>
          </div>
        </form>
        <form onSubmit={joinGroup} className="group-action-card">
          <label>{t("groups.joinWithCode")}</label>
          <div className="row">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder={t("groups.codePlaceholder")}
            />
            <button type="submit" className="btn-secondary">{t("groups.join")}</button>
          </div>
        </form>
      </div>

      <div className="group-list">
        {groups.length === 0 && <div className="empty">{t("groups.empty")}</div>}
        {groups.map((g) => (
          <button key={g.id} className="group-card" onClick={() => setSelectedId(g.id)}>
            <div className="group-card-main">
              <span className="group-name">{g.name}</span>
              <span className="group-meta">
                {t("groups.membersCount", { n: g.member_count })} · {g.role === "owner" ? t("groups.roleOwner") : t("groups.roleMember")}
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
  const t = useT();
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
          <button className="btn-back" onClick={onBack}>{t("groups.back")}</button>
          <h2>{detail.name}</h2>
        </div>
        <button className="gd-code" onClick={copyCode} title={t("groups.copyTitle")}>
          🔑 {detail.invite_code}
          <span className="gd-code-hint">{copied ? t("groups.copied") : t("groups.copyHint")}</span>
        </button>
      </div>

      {error && <div className="error-bar" onClick={() => setError(null)}>⚠️ {error}</div>}

      <div className="seg gd-tabs">
        <button className={tab === "habits" ? "active" : ""} onClick={() => setTab("habits")}>{t("groups.tabHabits")}</button>
        <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>
          {t("groups.tabTasks")} ({detail.tasks.filter((task) => !task.done).length})
        </button>
        <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}>{t("groups.tabStats")}</button>
        <button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>{t("groups.tabActivity")}</button>
        <button className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}>
          {t("groups.tabMembers")} ({detail.members.length})
        </button>
      </div>

      {/* ---- Odatlar ---- */}
      {tab === "habits" && (
        <div className="gd-section">
          <form className="habit-form-top gd-add" onSubmit={addHabit}>
            <input value={habitName} onChange={(e) => setHabitName(e.target.value)} placeholder={t("groups.addHabit")} />
            <button type="submit">{t("common.add")}</button>
          </form>

          {detail.habits.length === 0 && <div className="empty">{t("groups.noHabits")}</div>}
          {detail.habits.map((h) => {
            const dt = doneToday(h.id);
            const mine = iDidToday(h.id);
            return (
              <div key={h.id} className="gh-card">
                <div className="gh-head">
                  <span className="habit-dot" style={{ background: h.color }} />
                  <span className="gh-name">{h.name}</span>
                  <span className="gh-today">{t("groups.today", { done: dt, total: detail.members.length })}</span>
                  {isOwner && (
                    <button className="habit-del" onClick={() => deleteHabit(h.id)} title={t("common.delete")}>×</button>
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
                    {mine ? t("groups.done") : t("groups.iDid")}
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
                        title={t("groups.reactionTitle")}
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
              placeholder={t("groups.addTask")}
            />
            <button type="submit">{t("common.add")}</button>
          </form>
          {detail.tasks.length === 0 && <div className="empty">{t("groups.noTasks")}</div>}
          <div className="gtask-list">
            {detail.tasks.map((task) => (
              <div key={task.id} className={`gtask-row ${task.done ? "done" : ""}`}>
                <button className="gtask-check" onClick={() => toggleTask(task.id)}>
                  {task.done ? "✓" : ""}
                </button>
                <span className="gtask-title">{task.title}</span>
                {task.done && task.done_by && (
                  <span className="gtask-by">— {nameOf(task.done_by)}</span>
                )}
                <button className="gtask-del" onClick={() => deleteTask(task.id)} title={t("common.delete")}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Faoliyat (bildirishnoma tasmasi) ---- */}
      {tab === "activity" && (
        <div className="gd-section">
          {detail.activity.length === 0 && <div className="empty">{t("groups.noActivity")}</div>}
          <div className="activity-feed">
            {detail.activity.map((a) => (
              <div key={a.id} className="activity-row">
                <span className="activity-text">{a.text}</span>
                <span className="activity-time">
                  {new Date(a.created_at).toLocaleString(getLang(), {
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
              <div className="stat-label">{t("groups.rateLabel")}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num">{totalDone}</div>
              <div className="stat-label">{t("groups.totalWeek")}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num">{detail.habits.length}</div>
              <div className="stat-label">{t("groups.groupHabits")}</div>
            </div>
          </div>

          <div className="week-summary">
            <span>{t("groups.weekSummary")}</span>
            <span className="ws-cur">{t("groups.thisWeekN", { n: totalDone })}</span>
            <span className="ws-prev">{t("groups.prevWeekN", { n: prevTotal })}</span>
            {delta !== 0 && (
              <span className={`ws-delta ${delta > 0 ? "up" : "down"}`}>
                {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
              </span>
            )}
            {delta === 0 && <span className="ws-delta">{t("groups.equal")}</span>}
          </div>

          <h3 className="stat-h">{t("groups.leaderboard")}</h3>
          <div className="leaderboard">
            {leaderboard.map((m, i) => (
              <div key={m.user_id} className="lb-row">
                <span className="lb-rank">{i + 1}</span>
                <span className="avatar sm">{m.username.charAt(0).toUpperCase()}</span>
                <span className="lb-name">
                  {m.username}
                  {m.user_id === user.id && ` ${t("groups.you")}`}
                </span>
                <div className="lb-bar">
                  <div className="lb-bar-fill" style={{ width: `${(m.count / maxCount) * 100}%` }} />
                </div>
                <span className="lb-count">{m.count}</span>
              </div>
            ))}
          </div>

          <h3 className="stat-h">{t("groups.todayStatus")}</h3>
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
            {detail.habits.length === 0 && <div className="empty">{t("groups.noHabit")}</div>}
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
                placeholder={t("groups.addMember")}
              />
              <button type="submit">{t("common.add")}</button>
            </form>
          )}
          <div className="member-list">
            {detail.members.map((m) => (
              <div key={m.user_id} className="member-row">
                <span className="avatar sm">{m.username.charAt(0).toUpperCase()}</span>
                <span className="member-name">{m.username}</span>
                {m.role === "owner" && <span className="member-badge">{t("groups.badgeOwner")}</span>}
                {m.user_id === user.id && <span className="member-you">{t("groups.youBadge")}</span>}
                {isOwner && m.role !== "owner" && m.user_id !== user.id && (
                  <button
                    className="member-kick"
                    title={t("groups.kickTitle")}
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
                {isOwner ? t("groups.deleteGroup") : t("groups.leaveGroup")}
              </button>
            ) : (
              <div className="confirm-row">
                <button className="btn-danger" onClick={leaveOrDelete}>
                  {isOwner ? t("groups.confirmDelete") : t("groups.confirmLeave")}
                </button>
                <button className="btn-secondary" onClick={() => setConfirmDel(false)}>{t("common.cancel")}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
