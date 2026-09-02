use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Datelike, Duration, Utc};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::models::{CreateTask, Task, TaskQuery, UpdateTask};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tasks", get(list).post(create))
        .route("/tasks/:id", get(get_one).patch(update).delete(delete))
        .route("/tasks/:id/complete", post(complete))
}

async fn list(
    State(st): State<AppState>,
    user: AuthUser,
    Query(q): Query<TaskQuery>,
) -> AppResult<Json<Vec<Task>>> {
    // $1 doim user_id; project_id berilsa $2.
    let mut sql = String::from("SELECT * FROM tasks WHERE user_id = $1");
    if q.project_id.is_some() {
        sql.push_str(" AND project_id = $2");
    }
    if let Some(c) = q.completed {
        sql.push_str(&format!(" AND completed = {c}"));
    }
    match q.view.as_deref() {
        Some("today") => sql.push_str(" AND due_date::date = now()::date AND completed = false"),
        Some("overdue") => sql.push_str(" AND due_date < now() AND completed = false"),
        Some("upcoming") => sql.push_str(" AND due_date >= now() AND completed = false"),
        _ => {}
    }
    sql.push_str(" ORDER BY completed, priority DESC, due_date NULLS LAST, position, created_at");

    let mut query = sqlx::query_as::<_, Task>(&sql).bind(user.id);
    if let Some(pid) = q.project_id {
        query = query.bind(pid);
    }
    let rows = query.fetch_all(&st.db).await?;
    Ok(Json(rows))
}

async fn get_one(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Task>> {
    let row = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.id)
        .fetch_optional(&st.db)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(row))
}

async fn create(
    State(st): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateTask>,
) -> AppResult<Json<Task>> {
    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("sarlavha bo'sh bo'lishi mumkin emas".into()));
    }
    let row = sqlx::query_as::<_, Task>(
        "INSERT INTO tasks (title, project_id, notes, due_date, priority, recurrence, reminder_at, position, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE user_id = $8), 0),
                 $8)
         RETURNING *",
    )
    .bind(body.title.trim())
    .bind(body.project_id)
    .bind(body.notes)
    .bind(body.due_date)
    .bind(body.priority.clamp(0, 3))
    .bind(body.recurrence)
    .bind(body.reminder_at)
    .bind(user.id)
    .fetch_one(&st.db)
    .await?;
    Ok(Json(row))
}

async fn update(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateTask>,
) -> AppResult<Json<Task>> {
    // COALESCE + double_option: `Some(None)` => NULLga o'rnatish, `None` => tegmaslik.
    let row = sqlx::query_as::<_, Task>(
        "UPDATE tasks SET
            title       = COALESCE($3, title),
            notes       = COALESCE($4, notes),
            completed   = COALESCE($5, completed),
            completed_at = CASE
                WHEN $5 IS TRUE  THEN now()
                WHEN $5 IS FALSE THEN NULL
                ELSE completed_at END,
            project_id  = CASE WHEN $6 THEN $7 ELSE project_id END,
            due_date    = CASE WHEN $8 THEN $9 ELSE due_date END,
            priority    = COALESCE($10, priority),
            recurrence  = CASE WHEN $11 THEN $12 ELSE recurrence END,
            reminder_at = CASE WHEN $13 THEN $14 ELSE reminder_at END,
            position    = COALESCE($15, position),
            updated_at  = now()
         WHERE id = $1 AND user_id = $2
         RETURNING *",
    )
    .bind(id)
    .bind(user.id)
    .bind(body.title)
    .bind(body.notes)
    .bind(body.completed)
    .bind(body.project_id.is_some())
    .bind(body.project_id.flatten())
    .bind(body.due_date.is_some())
    .bind(body.due_date.flatten())
    .bind(body.priority.map(|p| p.clamp(0, 3)))
    .bind(body.recurrence.is_some())
    .bind(body.recurrence.flatten())
    .bind(body.reminder_at.is_some())
    .bind(body.reminder_at.flatten())
    .bind(body.position)
    .fetch_optional(&st.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(row))
}

/// Vazifani bajarilgan deb belgilash.
/// Agar takrorlanuvchi bo'lsa — bajarilgan deb belgilanmaydi,
/// balki muddati keyingi takrorga suriladi.
async fn complete(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Task>> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.id)
        .fetch_optional(&st.db)
        .await?
        .ok_or(AppError::NotFound)?;

    match (&task.recurrence, task.due_date) {
        (Some(rule), Some(due)) => {
            let next = next_occurrence(due, rule);
            let next_reminder = task.reminder_at.map(|r| r + (next - due));
            let row = sqlx::query_as::<_, Task>(
                "UPDATE tasks SET due_date = $2, reminder_at = $3, updated_at = now()
                 WHERE id = $1 RETURNING *",
            )
            .bind(id)
            .bind(next)
            .bind(next_reminder)
            .fetch_one(&st.db)
            .await?;
            Ok(Json(row))
        }
        _ => {
            let row = sqlx::query_as::<_, Task>(
                "UPDATE tasks SET completed = true, completed_at = now(), updated_at = now()
                 WHERE id = $1 RETURNING *",
            )
            .bind(id)
            .fetch_one(&st.db)
            .await?;
            Ok(Json(row))
        }
    }
}

async fn delete(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let res = sqlx::query("DELETE FROM tasks WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.id)
        .execute(&st.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Oddiy takrorlanish qoidasi bo'yicha keyingi sanani hisoblaydi.
fn next_occurrence(from: DateTime<Utc>, rule: &str) -> DateTime<Utc> {
    match rule {
        "daily" => from + Duration::days(1),
        "weekly" => from + Duration::weeks(1),
        "monthly" => add_months(from, 1),
        "yearly" => add_months(from, 12),
        _ => from + Duration::days(1),
    }
}

/// Oylarni qo'shish (kun oyning oxiridan oshib ketsa, oy oxiriga tushiriladi).
fn add_months(dt: DateTime<Utc>, months: i32) -> DateTime<Utc> {
    let mut year = dt.year();
    let mut month0 = dt.month0() as i32 + months;
    year += month0.div_euclid(12);
    month0 = month0.rem_euclid(12);
    let month = month0 as u32 + 1;
    let last_day = days_in_month(year, month);
    let day = dt.day().min(last_day);
    dt.with_day(1)
        .and_then(|d| d.with_year(year))
        .and_then(|d| d.with_month(month))
        .and_then(|d| d.with_day(day))
        .unwrap_or(dt)
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let (ny, nm) = if month == 12 { (year + 1, 1) } else { (year, month + 1) };
    let first_next = chrono::NaiveDate::from_ymd_opt(ny, nm, 1).unwrap();
    let first_this = chrono::NaiveDate::from_ymd_opt(year, month, 1).unwrap();
    (first_next - first_this).num_days() as u32
}
