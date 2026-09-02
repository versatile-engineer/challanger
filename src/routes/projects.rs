use axum::extract::{Path, State};
use axum::routing::{get, patch};
use axum::{Json, Router};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::models::{CreateProject, Project, UpdateProject};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects", get(list).post(create))
        .route("/projects/:id", patch(update).delete(delete))
}

async fn list(State(st): State<AppState>, user: AuthUser) -> AppResult<Json<Vec<Project>>> {
    let rows = sqlx::query_as::<_, Project>(
        "SELECT * FROM projects WHERE user_id = $1 ORDER BY position, created_at",
    )
    .bind(user.id)
    .fetch_all(&st.db)
    .await?;
    Ok(Json(rows))
}

async fn create(
    State(st): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateProject>,
) -> AppResult<Json<Project>> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("nom bo'sh bo'lishi mumkin emas".into()));
    }
    let row = sqlx::query_as::<_, Project>(
        "INSERT INTO projects (name, color, position, user_id)
         VALUES ($1, $2,
                 COALESCE((SELECT MAX(position) + 1 FROM projects WHERE user_id = $3), 0),
                 $3)
         RETURNING *",
    )
    .bind(body.name.trim())
    .bind(body.color)
    .bind(user.id)
    .fetch_one(&st.db)
    .await?;
    Ok(Json(row))
}

async fn update(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateProject>,
) -> AppResult<Json<Project>> {
    let row = sqlx::query_as::<_, Project>(
        "UPDATE projects SET
            name     = COALESCE($3, name),
            color    = COALESCE($4, color),
            position = COALESCE($5, position)
         WHERE id = $1 AND user_id = $2
         RETURNING *",
    )
    .bind(id)
    .bind(user.id)
    .bind(body.name)
    .bind(body.color)
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
    let res = sqlx::query("DELETE FROM projects WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.id)
        .execute(&st.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}
