mod auth;
mod error;
mod models;
mod routes;
mod telegram;

use std::sync::Arc;

use axum::routing::get;
use axum::Router;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use crate::telegram::TelegramBot;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub jwt_secret: Arc<String>,
    pub telegram: Option<Arc<TelegramBot>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "challanger=debug,tower_http=info,info".into()),
        )
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL o'rnatilishi kerak (.env yoki nix devShell)");
    let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".into());

    let db = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    // Migratsiyalarni ishga tushirish
    sqlx::migrate!("./migrations").run(&db).await?;

    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "dev-secret-o'zgartiring-productionda".into());

    // Telegram bot (ixtiyoriy) — TELEGRAM_BOT_TOKEN berilganda yoqiladi.
    let telegram = match TelegramBot::from_env(db.clone()).await {
        Some(bot) => {
            tracing::info!("🤖 Telegram bot yoqildi: @{}", bot.username());
            tokio::spawn(bot.clone().run_polling());
            tokio::spawn(bot.clone().run_reminders());
            Some(bot)
        }
        None => {
            tracing::info!("Telegram bot o'chirilgan (TELEGRAM_BOT_TOKEN yo'q yoki yaroqsiz)");
            None
        }
    };

    let state = AppState {
        db,
        jwt_secret: Arc::new(jwt_secret),
        telegram,
    };

    // Dev uchun CORS ochiq (Vite frontend boshqa portda ishlaydi)
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api = Router::new()
        .route("/health", get(|| async { "ok" }))
        .merge(auth::router())
        .merge(routes::projects::router())
        .merge(routes::tasks::router())
        .merge(routes::habits::router())
        .merge(routes::groups::router())
        .merge(routes::subtasks::router())
        .merge(routes::telegram::router());

    // Qurilgan frontend'ni (Vite `dist`) shu serverdan beramiz.
    // SPA bo'lgani uchun topilmagan yo'llar `index.html`ga yo'naltiriladi.
    // Dev'da bu papka bo'lmasligi mumkin — u holda oddiygina 404 qaytadi (Vite proxy ishlatiladi).
    let frontend_dir = std::env::var("FRONTEND_DIR").unwrap_or_else(|_| "frontend/dist".into());
    let index_html = format!("{frontend_dir}/index.html");
    let static_service = ServeDir::new(&frontend_dir).not_found_service(ServeFile::new(index_html));

    let app = Router::new()
        .nest("/api", api)
        .fallback_service(static_service)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    tracing::info!("🚀 Server ishga tushdi: http://{bind_addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
