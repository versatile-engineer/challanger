//! Pomodoro sessiyalari — tugatilgan taymerlarni yozadi va statistika beradi.

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::AppState;
use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};

pub fn router() -> Router<AppState> {
    Router::new().route("/pomodoro", get(stats).post(record))
}

#[derive(Deserialize)]
pub struct RecordSession {
    pub kind: String,
    pub seconds: i32,
}

#[derive(Serialize)]
struct DayCount {
    day: String,
    count: i64,
    minutes: i64,
}

#[derive(Serialize)]
struct PomodoroStats {
    today: i64,
    total: i64,
    minutes_total: i64,
    last30: Vec<DayCount>,
}

/// Tugatilgan sessiyani yozadi (faqat 'work' statistikaga hisoblanadi, lekin barchasi saqlanadi).
async fn record(
    State(st): State<AppState>,
    user: AuthUser,
    Json(body): Json<RecordSession>,
) -> AppResult<Json<serde_json::Value>> {
    let kind = match body.kind.as_str() {
        "work" | "short" | "long" => body.kind.as_str(),
        _ => return Err(AppError::BadRequest("noto'g'ri sessiya turi".into())),
    };
    let seconds = body.seconds.clamp(0, 24 * 3600);
    sqlx::query("INSERT INTO pomodoro_sessions (user_id, kind, seconds) VALUES ($1, $2, $3)")
        .bind(user.id)
        .bind(kind)
        .bind(seconds)
        .execute(&st.db)
        .await?;

    let today = sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM pomodoro_sessions
          WHERE user_id = $1 AND kind = 'work' AND created_at::date = now()::date",
    )
    .bind(user.id)
    .fetch_one(&st.db)
    .await?;
    Ok(Json(serde_json::json!({ "ok": true, "today": today })))
}

/// Fokus (work) sessiyalari statistikasi: bugungi son, jami, jami daqiqa, oxirgi 30 kun.
async fn stats(State(st): State<AppState>, user: AuthUser) -> AppResult<Json<PomodoroStats>> {
    let today = sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM pomodoro_sessions
          WHERE user_id = $1 AND kind = 'work' AND created_at::date = now()::date",
    )
    .bind(user.id)
    .fetch_one(&st.db)
    .await?;

    let (total, minutes_total) = sqlx::query_as::<_, (i64, Option<i64>)>(
        "SELECT count(*), COALESCE(sum(seconds), 0) / 60
           FROM pomodoro_sessions WHERE user_id = $1 AND kind = 'work'",
    )
    .bind(user.id)
    .fetch_one(&st.db)
    .await?;

    let rows = sqlx::query_as::<_, (chrono::NaiveDate, i64, Option<i64>)>(
        "SELECT created_at::date AS day, count(*), COALESCE(sum(seconds), 0) / 60
           FROM pomodoro_sessions
          WHERE user_id = $1 AND kind = 'work'
            AND created_at >= now() - interval '30 days'
          GROUP BY day
          ORDER BY day",
    )
    .bind(user.id)
    .fetch_all(&st.db)
    .await?;

    let last30 = rows
        .into_iter()
        .map(|(day, count, minutes)| DayCount {
            day: day.format("%Y-%m-%d").to_string(),
            count,
            minutes: minutes.unwrap_or(0),
        })
        .collect();

    Ok(Json(PomodoroStats {
        today,
        total,
        minutes_total: minutes_total.unwrap_or(0),
        last30,
    }))
}
