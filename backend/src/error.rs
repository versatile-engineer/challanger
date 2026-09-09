use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

/// Ilova bo'ylab yagona xato turi.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("topilmadi")]
    NotFound,

    #[error("avtorizatsiya talab qilinadi")]
    Unauthorized,

    #[error("noto'g'ri so'rov: {0}")]
    BadRequest(String),

    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::NotFound => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string()),
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::Db(sqlx::Error::RowNotFound) => {
                (StatusCode::NOT_FOUND, "topilmadi".to_string())
            }
            AppError::Db(e) => {
                tracing::error!("db xatosi: {e:?}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "ichki server xatosi".to_string(),
                )
            }
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
