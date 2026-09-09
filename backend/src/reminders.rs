//! Shaxsiy vazifa eslatmalari dispatcheri — bitta manba, ikki kanal:
//! Telegram (ulangan bo'lsa) va Web Push (obuna bo'lsa).
//!
//! Muddati yetgan eslatmalarni topib har ikki kanalga yuboradi, so'ng
//! `reminder_sent = true` qiladi (takror yubormaslik uchun). Guruh vazifasi
//! eslatmalari alohida — Telegram modulida qoladi.

use std::sync::Arc;
use std::time::Duration;

use sqlx::PgPool;

use crate::push::WebPush;
use crate::telegram::TelegramBot;

#[derive(sqlx::FromRow)]
struct Due {
    id: uuid::Uuid,
    title: String,
    user_id: uuid::Uuid,
    chat_id: Option<i64>,
}

/// Har 30 soniyada muddati yetgan shaxsiy eslatmalarni yuboradi.
pub async fn run(db: PgPool, telegram: Option<Arc<TelegramBot>>, push: Option<Arc<WebPush>>) {
    let mut ticker = tokio::time::interval(Duration::from_secs(30));
    loop {
        ticker.tick().await;
        if let Err(e) = tick(&db, telegram.as_deref(), push.as_deref()).await {
            tracing::warn!("Eslatma dispatcherida xato: {e:?}");
        }
    }
}

async fn tick(
    db: &PgPool,
    telegram: Option<&TelegramBot>,
    push: Option<&WebPush>,
) -> anyhow::Result<()> {
    let due = sqlx::query_as::<_, Due>(
        "SELECT t.id, t.title, t.user_id, u.telegram_chat_id AS chat_id
           FROM tasks t
           JOIN users u ON u.id = t.user_id
          WHERE t.reminder_at IS NOT NULL
            AND t.reminder_at <= now()
            AND t.reminder_sent = FALSE
            AND t.completed = FALSE
          LIMIT 50",
    )
    .fetch_all(db)
    .await?;

    for r in due {
        // Telegram — ulangan bo'lsa (tugmali xabar).
        if let (Some(bot), Some(chat_id)) = (telegram, r.chat_id) {
            bot.send_task_reminder(chat_id, &r.title, r.id).await;
        }
        // Web Push — obunalarga.
        if let Some(wp) = push {
            wp.send_to_user(db, r.user_id, "⏰ Eslatma", &r.title).await;
        }
        // Yuborildi deb belgilaymiz (ikkala kanal ham ixtiyoriy — baribir belgilaymiz).
        let _ = sqlx::query("UPDATE tasks SET reminder_sent = TRUE WHERE id = $1")
            .bind(r.id)
            .execute(db)
            .await;
    }
    Ok(())
}
