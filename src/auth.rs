use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::extract::{FromRef, FromRequestParts, State};
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::AppState;

// ---------- Modellar ----------

#[derive(Debug, Serialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    #[serde(skip)]
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct PublicUser {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub created_at: DateTime<Utc>,
}

impl From<User> for PublicUser {
    fn from(u: User) -> Self {
        PublicUser {
            id: u.id,
            username: u.username,
            email: u.email,
            created_at: u.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct SignupBody {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginBody {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: PublicUser,
}

// ---------- JWT ----------

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String, // user id
    exp: usize,  // muddati (unix seconds)
}

fn make_token(user_id: Uuid, secret: &str) -> AppResult<String> {
    let exp = (Utc::now() + chrono::Duration::days(30)).timestamp() as usize;
    let claims = Claims {
        sub: user_id.to_string(),
        exp,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|_| AppError::BadRequest("token yaratib bo'lmadi".into()))
}

// ---------- Parol ----------

fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|_| AppError::BadRequest("parolni hashlab bo'lmadi".into()))
}

fn verify_password(password: &str, hash: &str) -> bool {
    match PasswordHash::new(hash) {
        Ok(parsed) => Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

// ---------- Extractor: himoyalangan route'lar uchun ----------

/// So'rovdan `Authorization: Bearer <token>` ni o'qib, foydalanuvchini aniqlaydi.
pub struct AuthUser {
    pub id: Uuid,
}

#[axum::async_trait]
impl<S> FromRequestParts<S> for AuthUser
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app = AppState::from_ref(state);
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Unauthorized)?;
        let token = header.strip_prefix("Bearer ").ok_or(AppError::Unauthorized)?;

        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(app.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| AppError::Unauthorized)?;

        let id = Uuid::parse_str(&data.claims.sub).map_err(|_| AppError::Unauthorized)?;
        Ok(AuthUser { id })
    }
}

// ---------- Router ----------

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/signup", post(signup))
        .route("/auth/login", post(login))
        .route("/auth/me", get(me))
}

async fn signup(
    State(st): State<AppState>,
    Json(body): Json<SignupBody>,
) -> AppResult<(StatusCode, Json<AuthResponse>)> {
    let username = body.username.trim();
    let email = body.email.trim().to_lowercase();
    if username.is_empty() {
        return Err(AppError::BadRequest("foydalanuvchi nomi bo'sh".into()));
    }
    if !email.contains('@') {
        return Err(AppError::BadRequest("email noto'g'ri".into()));
    }
    if body.password.len() < 6 {
        return Err(AppError::BadRequest("parol kamida 6 ta belgidan iborat bo'lsin".into()));
    }

    let hash = hash_password(&body.password)?;

    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3) RETURNING *",
    )
    .bind(username)
    .bind(&email)
    .bind(hash)
    .fetch_one(&st.db)
    .await
    .map_err(|e| match e {
        sqlx::Error::Database(db) if db.is_unique_violation() => {
            AppError::BadRequest("bu email allaqachon ro'yxatdan o'tgan".into())
        }
        other => AppError::Db(other),
    })?;

    let token = make_token(user.id, &st.jwt_secret)?;
    Ok((
        StatusCode::CREATED,
        Json(AuthResponse {
            token,
            user: user.into(),
        }),
    ))
}

async fn login(
    State(st): State<AppState>,
    Json(body): Json<LoginBody>,
) -> AppResult<Json<AuthResponse>> {
    let email = body.email.trim().to_lowercase();
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(&st.db)
        .await?;

    let user = match user {
        Some(u) if verify_password(&body.password, &u.password_hash) => u,
        _ => return Err(AppError::BadRequest("email yoki parol noto'g'ri".into())),
    };

    let token = make_token(user.id, &st.jwt_secret)?;
    Ok(Json(AuthResponse {
        token,
        user: user.into(),
    }))
}

async fn me(State(st): State<AppState>, user: AuthUser) -> AppResult<Json<PublicUser>> {
    let u = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(user.id)
        .fetch_optional(&st.db)
        .await?
        .ok_or(AppError::Unauthorized)?;
    Ok(Json(u.into()))
}
