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

#[derive(Debug, Serialize, FromRow)]
struct HabitRow {
    id: Uuid,
    name: String,
    color: String,
    frequency: String, // 'daily' | 'weekly'
    target_per_week: i16,
    start_date: NaiveDate,
    duration_days: Option<i32>,
    end_date: Option<NaiveDate>,
    position: f64,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
struct Habit {
    #[serde(flatten)]
    habit: HabitRow,
    /// Bajarilgan kunlar (oxirgi ~90 kun ichida), ISO sana formatida
    days: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CreateHabit {
    name: String,
    #[serde(default = "default_color")]
    color: String,
    #[serde(default = "default_frequency")]
    frequency: String,
    #[serde(default = "default_target")]
    target_per_week: i16,
    start_date: Option<NaiveDate>,
    duration_days: Option<i32>,
    end_date: Option<NaiveDate>,
}

#[derive(Debug, Deserialize, Default)]
struct UpdateHabit {
    name: Option<String>,
    color: Option<String>,
    frequency: Option<String>,
    target_per_week: Option<i16>,
    position: Option<f64>,
    // `Some(None)` => NULLga o'rnatish, `None` => tegmaslik
    #[serde(default, deserialize_with = "double_option")]
    duration_days: Option<Option<i32>>,
    #[serde(default, deserialize_with = "double_option")]
    end_date: Option<Option<NaiveDate>>,
}

fn double_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Deserialize::deserialize(deserializer).map(Some)
}

#[derive(Debug, Deserialize)]
struct ToggleBody {
    day: NaiveDate,
}

fn default_color() -> String {
    "#10b981".to_string()
}
fn default_target() -> i16 {
    7
}
fn default_frequency() -> String {
    "daily".to_string()
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/habits", get(list).post(create))
        .route("/habits/:id", axum::routing::patch(update).delete(delete))
        .route("/habits/:id/toggle", post(toggle))
}

async fn list(State(st): State<AppState>, user: AuthUser) -> AppResult<Json<Vec<Habit>>> {
    let habits = sqlx::query_as::<_, HabitRow>(
        "SELECT id, name, color, frequency, target_per_week, start_date,
                duration_days, end_date, position, created_at
         FROM habits WHERE user_id = $1 ORDER BY position, created_at",
    )
    .bind(user.id)
    .fetch_all(&st.db)
    .await?;

    // Oxirgi 90 kunlik yozuvlar
    let entries: Vec<(Uuid, NaiveDate)> = sqlx::query_as(
        "SELECT e.habit_id, e.day
         FROM habit_entries e
         JOIN habits h ON h.id = e.habit_id
         WHERE h.user_id = $1 AND e.day >= (now()::date - INTERVAL '90 days')",
    )
    .bind(user.id)
    .fetch_all(&st.db)
    .await?;

    let result = habits
        .into_iter()
        .map(|h| {
            let days = entries
                .iter()
                .filter(|(hid, _)| *hid == h.id)
                .map(|(_, d)| d.to_string())
                .collect();
            Habit { habit: h, days }
        })
        .collect();

    Ok(Json(result))
}

async fn create(
    State(st): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateHabit>,
) -> AppResult<Json<Habit>> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("nom bo'sh bo'lishi mumkin emas".into()));
    }
    let frequency = if body.frequency == "weekly" { "weekly" } else { "daily" };
    let row = sqlx::query_as::<_, HabitRow>(
        "INSERT INTO habits
            (name, color, frequency, target_per_week, start_date, duration_days, end_date, position, user_id)
         VALUES ($1, $2, $3, $4, COALESCE($5, now()::date), $6, $7,
                 COALESCE((SELECT MAX(position) + 1 FROM habits WHERE user_id = $8), 0),
                 $8)
         RETURNING id, name, color, frequency, target_per_week, start_date,
                   duration_days, end_date, position, created_at",
    )
    .bind(body.name.trim())
    .bind(body.color)
    .bind(frequency)
    .bind(body.target_per_week.clamp(1, 7))
    .bind(body.start_date)
    .bind(body.duration_days.filter(|d| *d > 0))
    .bind(body.end_date)
    .bind(user.id)
    .fetch_one(&st.db)
    .await?;
    Ok(Json(Habit {
        habit: row,
        days: vec![],
    }))
}

async fn update(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateHabit>,
) -> AppResult<Json<HabitRow>> {
    let row = sqlx::query_as::<_, HabitRow>(
        "UPDATE habits SET
            name            = COALESCE($3, name),
            color           = COALESCE($4, color),
            frequency       = COALESCE($5, frequency),
            target_per_week = COALESCE($6, target_per_week),
            position        = COALESCE($7, position),
            duration_days   = CASE WHEN $8 THEN $9  ELSE duration_days END,
            end_date        = CASE WHEN $10 THEN $11 ELSE end_date END
         WHERE id = $1 AND user_id = $2
         RETURNING id, name, color, frequency, target_per_week, start_date,
                   duration_days, end_date, position, created_at",
    )
    .bind(id)
    .bind(user.id)
    .bind(body.name)
    .bind(body.color)
    .bind(body.frequency)
    .bind(body.target_per_week)
    .bind(body.position)
    .bind(body.duration_days.is_some())
    .bind(body.duration_days.flatten())
    .bind(body.end_date.is_some())
    .bind(body.end_date.flatten())
    .fetch_optional(&st.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(row))
}

async fn delete(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let res = sqlx::query("DELETE FROM habits WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.id)
        .execute(&st.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Berilgan kun uchun bajarilgan belgisini almashtiradi (bor bo'lsa o'chiradi, yo'q bo'lsa qo'shadi).
async fn toggle(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<ToggleBody>,
) -> AppResult<Json<serde_json::Value>> {
    // Egalikni tekshirish
    let owns: Option<Uuid> = sqlx::query_scalar("SELECT id FROM habits WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.id)
        .fetch_optional(&st.db)
        .await?;
    if owns.is_none() {
        return Err(AppError::NotFound);
    }

    let deleted = sqlx::query("DELETE FROM habit_entries WHERE habit_id = $1 AND day = $2")
        .bind(id)
        .bind(body.day)
        .execute(&st.db)
        .await?;

    let done = if deleted.rows_affected() == 0 {
        sqlx::query("INSERT INTO habit_entries (habit_id, day) VALUES ($1, $2)")
            .bind(id)
            .bind(body.day)
            .execute(&st.db)
            .await?;
        true
    } else {
        false
    };

    Ok(Json(serde_json::json!({ "day": body.day, "done": done })))
}
