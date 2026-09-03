use axum::extract::{Path, State};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::AppState;

#[derive(Debug, Serialize, FromRow)]
struct Subtask {
    id: Uuid,
    task_id: Uuid,
    title: String,
    done: bool,
    position: f64,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct CreateSubtask {
    title: String,
}

#[derive(Debug, Deserialize)]
struct UpdateSubtask {
    title: Option<String>,
    done: Option<bool>,
    position: Option<f64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/subtasks", get(list_all))
        .route("/tasks/:id/subtasks", post(create))
        .route("/subtasks/:id", patch(update).delete(delete))
}

/// Foydalanuvchining barcha vazifalaridagi kichik qadamlar.
async fn list_all(State(st): State<AppState>, user: AuthUser) -> AppResult<Json<Vec<Subtask>>> {
    let rows = sqlx::query_as::<_, Subtask>(
        "SELECT s.* FROM subtasks s
         JOIN tasks t ON t.id = s.task_id
         WHERE t.user_id = $1
         ORDER BY s.position, s.created_at",
    )
    .bind(user.id)
    .fetch_all(&st.db)
    .await?;
    Ok(Json(rows))
}

/// Vazifaning egasi ekanligini tekshiradi.
async fn assert_task_owner(st: &AppState, task_id: Uuid, user_id: Uuid) -> AppResult<()> {
    let owns: Option<Uuid> =
        sqlx::query_scalar("SELECT id FROM tasks WHERE id = $1 AND user_id = $2")
            .bind(task_id)
            .bind(user_id)
            .fetch_optional(&st.db)
            .await?;
    owns.map(|_| ()).ok_or(AppError::NotFound)
}

async fn create(
    State(st): State<AppState>,
    user: AuthUser,
    Path(task_id): Path<Uuid>,
    Json(body): Json<CreateSubtask>,
) -> AppResult<Json<Subtask>> {
    assert_task_owner(&st, task_id, user.id).await?;
    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("qadam bo'sh bo'lishi mumkin emas".into()));
    }
    let row = sqlx::query_as::<_, Subtask>(
        "INSERT INTO subtasks (task_id, title, position)
         VALUES ($1, $2, COALESCE((SELECT MAX(position) + 1 FROM subtasks WHERE task_id = $1), 0))
         RETURNING *",
    )
    .bind(task_id)
    .bind(body.title.trim())
    .fetch_one(&st.db)
    .await?;
    Ok(Json(row))
}

async fn update(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateSubtask>,
) -> AppResult<Json<Subtask>> {
    let row = sqlx::query_as::<_, Subtask>(
        "UPDATE subtasks s SET
            title    = COALESCE($3, title),
            done     = COALESCE($4, done),
            position = COALESCE($5, position)
         FROM tasks t
         WHERE s.id = $1 AND s.task_id = t.id AND t.user_id = $2
         RETURNING s.*",
    )
    .bind(id)
    .bind(user.id)
    .bind(body.title)
    .bind(body.done)
    .bind(body.position)
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
    let res = sqlx::query(
        "DELETE FROM subtasks s USING tasks t
         WHERE s.id = $1 AND s.task_id = t.id AND t.user_id = $2",
    )
    .bind(id)
    .bind(user.id)
    .execute(&st.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}
