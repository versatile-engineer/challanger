use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/telegram/status", get(status))
        .route("/telegram/link", post(link))
        .route("/telegram/unlink", post(unlink))
}

/// Ulanish holati: bot sozlanganmi va hisob ulanganmi.
async fn status(State(st): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let chat_id: Option<i64> =
        sqlx::query_scalar("SELECT telegram_chat_id FROM users WHERE id = $1")
            .bind(user.id)
            .fetch_one(&st.db)
            .await?;
    Ok(Json(json!({
        "configured": st.telegram.is_some(),
        "connected": chat_id.is_some(),
    })))
}

/// Bir martalik bog'lash kodi yaratadi va deep-link qaytaradi.
async fn link(State(st): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let bot = st
        .telegram
        .as_ref()
        .ok_or_else(|| AppError::BadRequest("Telegram bot serverda sozlanmagan".into()))?;

    // Qisqa, taxmin qilib bo'lmaydigan kod (deep-link start parametri sifatida xavfsiz).
    let code = Uuid::new_v4().simple().to_string()[..12].to_string();

    sqlx::query(
        "UPDATE users
            SET telegram_link_code = $2,
                telegram_link_expires = now() + interval '15 minutes'
          WHERE id = $1",
    )
    .bind(user.id)
    .bind(&code)
    .execute(&st.db)
    .await?;

    let deep_link = format!("https://t.me/{}?start={}", bot.username(), code);
    Ok(Json(json!({
        "deep_link": deep_link,
        "bot_username": bot.username(),
        "code": code,
    })))
}

/// Hisobni Telegram'dan uzadi.
async fn unlink(State(st): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    sqlx::query(
        "UPDATE users
            SET telegram_chat_id = NULL,
                telegram_link_code = NULL,
                telegram_link_expires = NULL
          WHERE id = $1",
    )
    .bind(user.id)
    .execute(&st.db)
    .await?;
    Ok(Json(json!({ "ok": true })))
}
