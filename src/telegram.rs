//! Telegram bot integratsiyasi.
//!
//! - **Long polling**: `getUpdates` orqali kiruvchi xabarlarni o'qiydi (webhook shart emas).
//! - **Hisobni bog'lash**: `/start <kod>` buyrug'i chat'ni foydalanuvchiga bog'laydi.
//! - **Eslatma sikli**: `reminder_at` yetgan vazifalar uchun xabar yuboradi.
//!
//! Bot faqat `TELEGRAM_BOT_TOKEN` muhit o'zgaruvchisi berilganda yoqiladi.

use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

const API_BASE: &str = "https://api.telegram.org";

pub struct TelegramBot {
    token: String,
    username: String,
    client: reqwest::Client,
    db: PgPool,
}

// ---------- getUpdates javob modellari ----------

#[derive(Deserialize)]
struct Updates {
    result: Vec<Update>,
}

#[derive(Deserialize)]
struct Update {
    update_id: i64,
    message: Option<Message>,
}

#[derive(Deserialize)]
struct Message {
    chat: Chat,
    text: Option<String>,
}

#[derive(Deserialize)]
struct Chat {
    id: i64,
}

// ---------- Eslatma qatori ----------

#[derive(sqlx::FromRow)]
struct DueReminder {
    id: Uuid,
    title: String,
    chat_id: i64,
}

impl TelegramBot {
    /// `TELEGRAM_BOT_TOKEN` berilgan bo'lsa botni yaratadi va `getMe` orqali
    /// bot username'ini aniqlaydi. Token yo'q yoki token yaroqsiz bo'lsa `None`.
    pub async fn from_env(db: PgPool) -> Option<Arc<Self>> {
        let token = std::env::var("TELEGRAM_BOT_TOKEN").ok()?;
        let token = token.trim().to_string();
        if token.is_empty() {
            return None;
        }
        let client = reqwest::Client::new();

        // Bot username'i deep-link (t.me/<username>?start=...) uchun kerak.
        let username = match get_me_username(&client, &token).await {
            Some(u) => u,
            None => {
                tracing::warn!("Telegram: getMe muvaffaqiyatsiz — token noto'g'ri yoki tarmoq yo'q");
                return None;
            }
        };

        Some(Arc::new(Self {
            token,
            username,
            client,
            db,
        }))
    }

    pub fn username(&self) -> &str {
        &self.username
    }

    /// Bitta chatga xabar yuboradi (HTML rejimida).
    async fn send_message(&self, chat_id: i64, text: &str) -> anyhow::Result<()> {
        let url = format!("{API_BASE}/bot{}/sendMessage", self.token);
        self.client
            .post(url)
            .json(&serde_json::json!({
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": true,
            }))
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    // ---------- Long polling ----------

    /// Kiruvchi yangilanishlarni doimiy o'qib turadi.
    pub async fn run_polling(self: Arc<Self>) {
        let mut offset: i64 = 0;
        loop {
            match self.poll_once(offset).await {
                Ok(next) => offset = next,
                Err(e) => {
                    tracing::warn!("Telegram poll xatosi: {e:?}");
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        }
    }

    async fn poll_once(&self, offset: i64) -> anyhow::Result<i64> {
        let url = format!("{API_BASE}/bot{}/getUpdates", self.token);
        let resp: Updates = self
            .client
            .get(url)
            .query(&[("timeout", "30"), ("offset", &offset.to_string())])
            .timeout(Duration::from_secs(45))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        let mut next = offset;
        for upd in resp.result {
            next = upd.update_id + 1;
            if let Some(msg) = upd.message {
                self.handle_message(msg).await;
            }
        }
        Ok(next)
    }

    async fn handle_message(&self, msg: Message) {
        let chat_id = msg.chat.id;
        let Some(text) = msg.text else { return };
        let text = text.trim();

        if let Some(rest) = text.strip_prefix("/start") {
            let code = rest.trim();
            if code.is_empty() {
                let _ = self
                    .send_message(
                        chat_id,
                        "Salom! 👋\nChallanger hisobingizni ulash uchun ilovada \
                         <b>Sozlamalar → Telegram</b> bo'limini oching va havolani bosing.",
                    )
                    .await;
            } else {
                self.link_account(chat_id, code).await;
            }
        } else if text.starts_with("/today") {
            self.send_today(chat_id).await;
        } else if text.starts_with("/help") {
            let _ = self
                .send_message(
                    chat_id,
                    "Buyruqlar:\n/today — bugungi vazifalar\n/help — yordam\n\n\
                     Vazifa eslatmalari belgilangan vaqtida avtomatik keladi.",
                )
                .await;
        }
    }

    /// `/start <kod>` — kodni tekshirib, chat'ni foydalanuvchiga bog'laydi.
    async fn link_account(&self, chat_id: i64, code: &str) {
        // Avval bu chatni boshqa hisobdan uzamiz (bir chat — bir hisob).
        let _ = sqlx::query("UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = $1")
            .bind(chat_id)
            .execute(&self.db)
            .await;

        let linked = sqlx::query_scalar::<_, Uuid>(
            "UPDATE users
                SET telegram_chat_id = $1,
                    telegram_link_code = NULL,
                    telegram_link_expires = NULL
              WHERE telegram_link_code = $2
                AND telegram_link_expires > now()
              RETURNING id",
        )
        .bind(chat_id)
        .bind(code)
        .fetch_optional(&self.db)
        .await;

        let text = match linked {
            Ok(Some(_)) => "✅ Hisobingiz ulandi! Endi vazifa eslatmalari shu yerga keladi.\n\n\
                            /today — bugungi vazifalar",
            _ => "❌ Havola yaroqsiz yoki muddati oʻtgan.\nIlovadan yangi havola oling.",
        };
        let _ = self.send_message(chat_id, text).await;
    }

    /// `/today` — chatga bog'langan foydalanuvchining bugungi vazifalari.
    async fn send_today(&self, chat_id: i64) {
        let uid = sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE telegram_chat_id = $1")
            .bind(chat_id)
            .fetch_optional(&self.db)
            .await
            .ok()
            .flatten();

        let Some(uid) = uid else {
            let _ = self
                .send_message(chat_id, "Avval hisobingizni ilovadan ulang (Sozlamalar → Telegram).")
                .await;
            return;
        };

        let rows = sqlx::query_as::<_, (String, bool)>(
            "SELECT title, completed FROM tasks
              WHERE user_id = $1 AND due_date::date = now()::date
              ORDER BY completed, priority DESC, due_date",
        )
        .bind(uid)
        .fetch_all(&self.db)
        .await
        .unwrap_or_default();

        if rows.is_empty() {
            let _ = self.send_message(chat_id, "Bugunga vazifa yo'q 🎉").await;
            return;
        }

        let mut msg = String::from("<b>Bugungi vazifalar:</b>\n");
        for (title, done) in rows {
            let mark = if done { "✅" } else { "◻️" };
            msg.push_str(&format!("{mark} {}\n", html_escape(&title)));
        }
        let _ = self.send_message(chat_id, &msg).await;
    }

    // ---------- Eslatma sikli ----------

    /// Har 30 soniyada muddati yetgan eslatmalarni yuboradi.
    pub async fn run_reminders(self: Arc<Self>) {
        let mut ticker = tokio::time::interval(Duration::from_secs(30));
        loop {
            ticker.tick().await;
            if let Err(e) = self.send_due_reminders().await {
                tracing::warn!("Eslatma yuborishda xato: {e:?}");
            }
        }
    }

    async fn send_due_reminders(&self) -> anyhow::Result<()> {
        let due = sqlx::query_as::<_, DueReminder>(
            "SELECT t.id, t.title, u.telegram_chat_id AS chat_id
               FROM tasks t
               JOIN users u ON u.id = t.user_id
              WHERE t.reminder_at IS NOT NULL
                AND t.reminder_at <= now()
                AND t.reminder_sent = FALSE
                AND t.completed = FALSE
                AND u.telegram_chat_id IS NOT NULL
              LIMIT 50",
        )
        .fetch_all(&self.db)
        .await?;

        for r in due {
            let text = format!("⏰ <b>Eslatma:</b> {}", html_escape(&r.title));
            match self.send_message(r.chat_id, &text).await {
                Ok(_) => {
                    let _ = sqlx::query("UPDATE tasks SET reminder_sent = TRUE WHERE id = $1")
                        .bind(r.id)
                        .execute(&self.db)
                        .await;
                }
                // Yuborilmasa — belgilamaymiz, keyingi siklda qayta urinadi.
                Err(e) => tracing::warn!("Telegram xabar yuborilmadi (chat {}): {e:?}", r.chat_id),
            }
        }
        Ok(())
    }
}

/// `getMe` orqali bot username'ini oladi.
async fn get_me_username(client: &reqwest::Client, token: &str) -> Option<String> {
    let url = format!("{API_BASE}/bot{token}/getMe");
    let resp: serde_json::Value = client.get(url).send().await.ok()?.json().await.ok()?;
    resp.get("result")?
        .get("username")?
        .as_str()
        .map(|s| s.to_string())
}

/// Telegram HTML rejimidagi maxsus belgilarni ekranlaydi.
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}
