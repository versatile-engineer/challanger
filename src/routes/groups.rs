use std::collections::HashMap;

use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::AppState;

// ---------- Modellar ----------

#[derive(Debug, Serialize, FromRow)]
struct GroupSummary {
    id: Uuid,
    name: String,
    invite_code: String,
    owner_id: Uuid,
    role: String,
    member_count: i64,
}

#[derive(Debug, Serialize, FromRow)]
struct MemberInfo {
    user_id: Uuid,
    username: String,
    role: String,
    joined_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow)]
struct GroupHabitRow {
    id: Uuid,
    name: String,
    color: String,
    frequency: String,
    target_per_week: i16,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
struct GroupHabitInfo {
    #[serde(flatten)]
    habit: GroupHabitRow,
    /// user_id -> bajarilgan kunlar (oxirgi 90 kun)
    entries: HashMap<Uuid, Vec<String>>,
    /// emoji -> reaksiya bergan foydalanuvchilar soni
    reactions: HashMap<String, i64>,
    /// joriy foydalanuvchi bosgan emoji'lar
    my_reactions: Vec<String>,
}

#[derive(Debug, Serialize, FromRow)]
struct GroupTaskInfo {
    id: Uuid,
    title: String,
    done: bool,
    created_by: Option<Uuid>,
    done_by: Option<Uuid>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow)]
struct ActivityInfo {
    id: Uuid,
    text: String,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
struct GroupDetail {
    id: Uuid,
    name: String,
    invite_code: String,
    owner_id: Uuid,
    members: Vec<MemberInfo>,
    habits: Vec<GroupHabitInfo>,
    tasks: Vec<GroupTaskInfo>,
    activity: Vec<ActivityInfo>,
}

#[derive(Debug, Deserialize)]
struct CreateGroup {
    name: String,
}

#[derive(Debug, Deserialize)]
struct AddMember {
    username: String,
}

#[derive(Debug, Deserialize)]
struct JoinGroup {
    code: String,
}

#[derive(Debug, Deserialize)]
struct CreateGroupHabit {
    name: String,
    #[serde(default = "default_color")]
    color: String,
    #[serde(default = "default_frequency")]
    frequency: String,
    #[serde(default = "default_target")]
    target_per_week: i16,
}

#[derive(Debug, Deserialize)]
struct ToggleBody {
    day: NaiveDate,
}

#[derive(Debug, Deserialize)]
struct CreateGroupTask {
    title: String,
}

#[derive(Debug, Deserialize)]
struct ReactBody {
    emoji: String,
}

fn default_color() -> String {
    "#10b981".into()
}
fn default_frequency() -> String {
    "daily".into()
}
fn default_target() -> i16 {
    7
}

// ---------- Router ----------

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/groups", get(list_groups).post(create_group))
        .route("/groups/join", post(join_group))
        .route("/groups/:id", get(get_group).delete(delete_group))
        .route("/groups/:id/members", post(add_member))
        .route(
            "/groups/:id/members/:uid",
            axum::routing::delete(remove_member),
        )
        .route("/groups/:id/leave", post(leave_group))
        .route("/groups/:id/habits", post(create_group_habit))
        .route(
            "/groups/:id/habits/:hid",
            axum::routing::delete(delete_group_habit),
        )
        .route("/group-habits/:id/toggle", post(toggle_group_habit))
        .route("/group-habits/:id/react", post(react_group_habit))
        .route("/groups/:id/tasks", post(create_group_task))
        .route("/group-tasks/:id/toggle", post(toggle_group_task))
        .route("/group-tasks/:id", axum::routing::delete(delete_group_task))
}

// ---------- Yordamchilar ----------

async fn require_member(st: &AppState, group_id: Uuid, user_id: Uuid) -> AppResult<String> {
    let role: Option<String> =
        sqlx::query_scalar("SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2")
            .bind(group_id)
            .bind(user_id)
            .fetch_optional(&st.db)
            .await?;
    role.ok_or(AppError::NotFound)
}

async fn require_owner(st: &AppState, group_id: Uuid, user_id: Uuid) -> AppResult<()> {
    if require_member(st, group_id, user_id).await? != "owner" {
        return Err(AppError::BadRequest("faqat guruh egasi buni qila oladi".into()));
    }
    Ok(())
}

fn invite_code() -> String {
    Uuid::new_v4().simple().to_string()[..8].to_uppercase()
}

/// Guruh faoliyat tasmasiga yozuv qo'shadi (xatolarni jimgina yutadi).
async fn log_activity(st: &AppState, group_id: Uuid, text: impl Into<String>) {
    let _ = sqlx::query("INSERT INTO group_activity (group_id, text) VALUES ($1, $2)")
        .bind(group_id)
        .bind(text.into())
        .execute(&st.db)
        .await;
}

async fn username_of(st: &AppState, user_id: Uuid) -> String {
    sqlx::query_scalar::<_, String>("SELECT username FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&st.db)
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| "kimdir".into())
}

// ---------- Handlerlar ----------

async fn list_groups(State(st): State<AppState>, user: AuthUser) -> AppResult<Json<Vec<GroupSummary>>> {
    let rows = sqlx::query_as::<_, GroupSummary>(
        "SELECT g.id, g.name, g.invite_code, g.owner_id, gm.role,
                (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count
         FROM groups g
         JOIN group_members gm ON gm.group_id = g.id
         WHERE gm.user_id = $1
         ORDER BY g.created_at DESC",
    )
    .bind(user.id)
    .fetch_all(&st.db)
    .await?;
    Ok(Json(rows))
}

async fn create_group(
    State(st): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateGroup>,
) -> AppResult<Json<GroupSummary>> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("guruh nomi bo'sh bo'lishi mumkin emas".into()));
    }
    let mut tx = st.db.begin().await?;
    let group_id: Uuid = sqlx::query_scalar(
        "INSERT INTO groups (name, owner_id, invite_code) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(body.name.trim())
    .bind(user.id)
    .bind(invite_code())
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')")
        .bind(group_id)
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    let summary = sqlx::query_as::<_, GroupSummary>(
        "SELECT g.id, g.name, g.invite_code, g.owner_id, gm.role,
                (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count
         FROM groups g JOIN group_members gm ON gm.group_id = g.id
         WHERE g.id = $1 AND gm.user_id = $2",
    )
    .bind(group_id)
    .bind(user.id)
    .fetch_one(&st.db)
    .await?;
    Ok(Json(summary))
}

async fn get_group(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<GroupDetail>> {
    require_member(&st, id, user.id).await?;

    let (name, invite_code, owner_id): (String, String, Uuid) =
        sqlx::query_as("SELECT name, invite_code, owner_id FROM groups WHERE id = $1")
            .bind(id)
            .fetch_one(&st.db)
            .await?;

    let members = sqlx::query_as::<_, MemberInfo>(
        "SELECT gm.user_id, u.username, gm.role, gm.joined_at
         FROM group_members gm JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = $1
         ORDER BY gm.role DESC, gm.joined_at",
    )
    .bind(id)
    .fetch_all(&st.db)
    .await?;

    let habit_rows = sqlx::query_as::<_, GroupHabitRow>(
        "SELECT id, name, color, frequency, target_per_week, created_at
         FROM group_habits WHERE group_id = $1 ORDER BY created_at",
    )
    .bind(id)
    .fetch_all(&st.db)
    .await?;

    // Barcha yozuvlar (oxirgi 90 kun) — bitta so'rovda
    let entries: Vec<(Uuid, Uuid, NaiveDate)> = sqlx::query_as(
        "SELECT e.group_habit_id, e.user_id, e.day
         FROM group_habit_entries e
         JOIN group_habits h ON h.id = e.group_habit_id
         WHERE h.group_id = $1 AND e.day >= (now()::date - INTERVAL '90 days')",
    )
    .bind(id)
    .fetch_all(&st.db)
    .await?;

    // Reaksiyalar (barcha odatlar bo'yicha bitta so'rovda)
    let reactions: Vec<(Uuid, String, Uuid)> = sqlx::query_as(
        "SELECT r.group_habit_id, r.emoji, r.user_id
         FROM group_habit_reactions r
         JOIN group_habits h ON h.id = r.group_habit_id
         WHERE h.group_id = $1",
    )
    .bind(id)
    .fetch_all(&st.db)
    .await?;

    let habits = habit_rows
        .into_iter()
        .map(|h| {
            let mut map: HashMap<Uuid, Vec<String>> = HashMap::new();
            for (hid, uid, day) in entries.iter() {
                if *hid == h.id {
                    map.entry(*uid).or_default().push(day.to_string());
                }
            }
            let mut rmap: HashMap<String, i64> = HashMap::new();
            let mut mine: Vec<String> = Vec::new();
            for (hid, emoji, uid) in reactions.iter() {
                if *hid == h.id {
                    *rmap.entry(emoji.clone()).or_default() += 1;
                    if *uid == user.id {
                        mine.push(emoji.clone());
                    }
                }
            }
            GroupHabitInfo {
                habit: h,
                entries: map,
                reactions: rmap,
                my_reactions: mine,
            }
        })
        .collect();

    let tasks = sqlx::query_as::<_, GroupTaskInfo>(
        "SELECT id, title, done, created_by, done_by, created_at
         FROM group_tasks WHERE group_id = $1 ORDER BY done, created_at DESC",
    )
    .bind(id)
    .fetch_all(&st.db)
    .await?;

    let activity = sqlx::query_as::<_, ActivityInfo>(
        "SELECT id, text, created_at FROM group_activity
         WHERE group_id = $1 ORDER BY created_at DESC LIMIT 30",
    )
    .bind(id)
    .fetch_all(&st.db)
    .await?;

    Ok(Json(GroupDetail {
        id,
        name,
        invite_code,
        owner_id,
        members,
        habits,
        tasks,
        activity,
    }))
}

async fn add_member(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<AddMember>,
) -> AppResult<Json<serde_json::Value>> {
    require_owner(&st, id, user.id).await?;

    let username = body.username.trim().to_lowercase();
    let target: Option<Uuid> = sqlx::query_scalar("SELECT id FROM users WHERE username = $1")
        .bind(&username)
        .fetch_optional(&st.db)
        .await?;
    let target = target.ok_or_else(|| AppError::BadRequest("bunday foydalanuvchi topilmadi".into()))?;

    let res = sqlx::query(
        "INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)
         ON CONFLICT (group_id, user_id) DO NOTHING",
    )
    .bind(id)
    .bind(target)
    .execute(&st.db)
    .await?;
    if res.rows_affected() > 0 {
        log_activity(&st, id, format!("➕ {username} guruhga qo'shildi")).await;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Guruh egasi boshqa a'zoni chiqarib yuboradi.
async fn remove_member(
    State(st): State<AppState>,
    user: AuthUser,
    Path((id, uid)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    require_owner(&st, id, user.id).await?;
    if uid == user.id {
        return Err(AppError::BadRequest(
            "o'zingizni chiqara olmaysiz — guruhni o'chiring".into(),
        ));
    }

    let mut tx = st.db.begin().await?;
    // A'zoning shu guruhdagi jamoaviy odat yozuvlarini tozalaymiz
    sqlx::query(
        "DELETE FROM group_habit_entries e
         USING group_habits h
         WHERE e.group_habit_id = h.id AND h.group_id = $1 AND e.user_id = $2",
    )
    .bind(id)
    .bind(uid)
    .execute(&mut *tx)
    .await?;

    let res = sqlx::query(
        "DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 AND role <> 'owner'",
    )
    .bind(id)
    .bind(uid)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    if res.rows_affected() == 0 {
        return Err(AppError::BadRequest("a'zo topilmadi".into()));
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn join_group(
    State(st): State<AppState>,
    user: AuthUser,
    Json(body): Json<JoinGroup>,
) -> AppResult<Json<serde_json::Value>> {
    let code = body.code.trim().to_uppercase();
    let group_id: Option<Uuid> = sqlx::query_scalar("SELECT id FROM groups WHERE invite_code = $1")
        .bind(&code)
        .fetch_optional(&st.db)
        .await?;
    let group_id = group_id.ok_or_else(|| AppError::BadRequest("taklif kodi noto'g'ri".into()))?;

    let res = sqlx::query(
        "INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)
         ON CONFLICT (group_id, user_id) DO NOTHING",
    )
    .bind(group_id)
    .bind(user.id)
    .execute(&st.db)
    .await?;
    if res.rows_affected() > 0 {
        let uname = username_of(&st, user.id).await;
        log_activity(&st, group_id, format!("➕ {uname} guruhga qo'shildi")).await;
    }
    Ok(Json(serde_json::json!({ "ok": true, "group_id": group_id })))
}

async fn leave_group(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let role = require_member(&st, id, user.id).await?;
    if role == "owner" {
        return Err(AppError::BadRequest(
            "egasi guruhni tark eta olmaydi — o'chiring".into(),
        ));
    }
    sqlx::query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.id)
        .execute(&st.db)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn delete_group(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    require_owner(&st, id, user.id).await?;
    sqlx::query("DELETE FROM groups WHERE id = $1")
        .bind(id)
        .execute(&st.db)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn create_group_habit(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateGroupHabit>,
) -> AppResult<Json<GroupHabitRow>> {
    require_member(&st, id, user.id).await?;
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("nom bo'sh bo'lishi mumkin emas".into()));
    }
    let freq = if body.frequency == "weekly" { "weekly" } else { "daily" };
    let row = sqlx::query_as::<_, GroupHabitRow>(
        "INSERT INTO group_habits (group_id, name, color, frequency, target_per_week)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, color, frequency, target_per_week, created_at",
    )
    .bind(id)
    .bind(body.name.trim())
    .bind(body.color)
    .bind(freq)
    .bind(body.target_per_week.clamp(1, 7))
    .fetch_one(&st.db)
    .await?;
    let uname = username_of(&st, user.id).await;
    log_activity(&st, id, format!("🔥 {uname} yangi odat qo'shdi: {}", row.name)).await;
    Ok(Json(row))
}

// ---------- Reaksiyalar ----------

/// Jamoaviy odatga emoji reaksiyasini almashtiradi (faqat a'zolar).
async fn react_group_habit(
    State(st): State<AppState>,
    user: AuthUser,
    Path(hid): Path<Uuid>,
    Json(body): Json<ReactBody>,
) -> AppResult<Json<serde_json::Value>> {
    let group_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT gh.group_id FROM group_habits gh
         JOIN group_members gm ON gm.group_id = gh.group_id AND gm.user_id = $2
         WHERE gh.id = $1",
    )
    .bind(hid)
    .bind(user.id)
    .fetch_optional(&st.db)
    .await?;
    if group_id.is_none() {
        return Err(AppError::NotFound);
    }
    let emoji = body.emoji.chars().take(8).collect::<String>();
    if emoji.is_empty() {
        return Err(AppError::BadRequest("emoji bo'sh".into()));
    }

    let deleted = sqlx::query(
        "DELETE FROM group_habit_reactions WHERE group_habit_id = $1 AND user_id = $2 AND emoji = $3",
    )
    .bind(hid)
    .bind(user.id)
    .bind(&emoji)
    .execute(&st.db)
    .await?;

    let active = if deleted.rows_affected() == 0 {
        sqlx::query(
            "INSERT INTO group_habit_reactions (group_habit_id, user_id, emoji) VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING",
        )
        .bind(hid)
        .bind(user.id)
        .bind(&emoji)
        .execute(&st.db)
        .await?;
        true
    } else {
        false
    };
    Ok(Json(serde_json::json!({ "emoji": emoji, "active": active })))
}

// ---------- Umumiy vazifalar ----------

async fn create_group_task(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateGroupTask>,
) -> AppResult<Json<GroupTaskInfo>> {
    require_member(&st, id, user.id).await?;
    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("vazifa bo'sh bo'lishi mumkin emas".into()));
    }
    let row = sqlx::query_as::<_, GroupTaskInfo>(
        "INSERT INTO group_tasks (group_id, title, created_by) VALUES ($1, $2, $3)
         RETURNING id, title, done, created_by, done_by, created_at",
    )
    .bind(id)
    .bind(body.title.trim())
    .bind(user.id)
    .fetch_one(&st.db)
    .await?;
    Ok(Json(row))
}

/// Umumiy vazifa holatini almashtiradi (faqat a'zolar).
async fn toggle_group_task(
    State(st): State<AppState>,
    user: AuthUser,
    Path(tid): Path<Uuid>,
) -> AppResult<Json<GroupTaskInfo>> {
    // Vazifa qaysi guruhda va foydalanuvchi a'zomi?
    let group_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT gt.group_id FROM group_tasks gt
         JOIN group_members gm ON gm.group_id = gt.group_id AND gm.user_id = $2
         WHERE gt.id = $1",
    )
    .bind(tid)
    .bind(user.id)
    .fetch_optional(&st.db)
    .await?;
    let group_id = group_id.ok_or(AppError::NotFound)?;

    let row = sqlx::query_as::<_, GroupTaskInfo>(
        "UPDATE group_tasks SET
            done = NOT done,
            done_by = CASE WHEN NOT done THEN $2 ELSE NULL END
         WHERE id = $1
         RETURNING id, title, done, created_by, done_by, created_at",
    )
    .bind(tid)
    .bind(user.id)
    .fetch_one(&st.db)
    .await?;

    if row.done {
        let uname = username_of(&st, user.id).await;
        log_activity(&st, group_id, format!("✅ {uname} bajardi: {}", row.title)).await;
    }
    Ok(Json(row))
}

async fn delete_group_task(
    State(st): State<AppState>,
    user: AuthUser,
    Path(tid): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let res = sqlx::query(
        "DELETE FROM group_tasks gt
         USING group_members gm
         WHERE gt.id = $1 AND gm.group_id = gt.group_id AND gm.user_id = $2",
    )
    .bind(tid)
    .bind(user.id)
    .execute(&st.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn delete_group_habit(
    State(st): State<AppState>,
    user: AuthUser,
    Path((id, hid)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    require_owner(&st, id, user.id).await?;
    sqlx::query("DELETE FROM group_habits WHERE id = $1 AND group_id = $2")
        .bind(hid)
        .bind(id)
        .execute(&st.db)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Joriy foydalanuvchining shu kundagi belgisini almashtiradi (faqat a'zolar).
async fn toggle_group_habit(
    State(st): State<AppState>,
    user: AuthUser,
    Path(hid): Path<Uuid>,
    Json(body): Json<ToggleBody>,
) -> AppResult<Json<serde_json::Value>> {
    // Odat qaysi guruhga tegishli va foydalanuvchi a'zomi?
    let group_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT gh.group_id FROM group_habits gh
         JOIN group_members gm ON gm.group_id = gh.group_id AND gm.user_id = $2
         WHERE gh.id = $1",
    )
    .bind(hid)
    .bind(user.id)
    .fetch_optional(&st.db)
    .await?;
    if group_id.is_none() {
        return Err(AppError::NotFound);
    }

    let deleted = sqlx::query(
        "DELETE FROM group_habit_entries WHERE group_habit_id = $1 AND user_id = $2 AND day = $3",
    )
    .bind(hid)
    .bind(user.id)
    .bind(body.day)
    .execute(&st.db)
    .await?;

    let done = if deleted.rows_affected() == 0 {
        sqlx::query(
            "INSERT INTO group_habit_entries (group_habit_id, user_id, day) VALUES ($1, $2, $3)",
        )
        .bind(hid)
        .bind(user.id)
        .bind(body.day)
        .execute(&st.db)
        .await?;
        true
    } else {
        false
    };
    Ok(Json(serde_json::json!({ "day": body.day, "done": done })))
}
