//! Telegram bot integratsiyasi.
//!
//! - **Long polling**: `getUpdates` orqali kiruvchi xabarlarni o'qiydi (webhook shart emas).
//! - **Hisobni bog'lash**: `/start <kod>` buyrug'i chat'ni foydalanuvchiga bog'laydi.
//! - **Eslatma sikli**: `reminder_at` yetgan vazifalar uchun xabar yuboradi.
//!
//! Bot faqat `TELEGRAM_BOT_TOKEN` muhit o'zgaruvchisi berilganda yoqiladi.

use std::sync::Arc;
use std::time::Duration;

use chrono::Timelike;
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
    callback_query: Option<CallbackQuery>,
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

#[derive(Deserialize)]
struct CallbackQuery {
    id: String,
    data: Option<String>,
    message: Option<CallbackMessage>,
}

#[derive(Deserialize)]
struct CallbackMessage {
    chat: Chat,
    message_id: i64,
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
                tracing::warn!(
                    "Telegram: getMe muvaffaqiyatsiz — token noto'g'ri yoki tarmoq yo'q"
                );
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

    /// Bitta vazifaga "✅ Bajarildi" inline tugmasi bilan xabar yuboradi.
    async fn send_with_done_button(
        &self,
        chat_id: i64,
        text: &str,
        task_id: Uuid,
    ) -> anyhow::Result<()> {
        let url = format!("{API_BASE}/bot{}/sendMessage", self.token);
        self.client
            .post(url)
            .json(&serde_json::json!({
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": true,
                "reply_markup": {
                    "inline_keyboard": [[
                        { "text": "✅ Bajarildi", "callback_data": format!("done:{task_id}") }
                    ]]
                }
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
            } else if let Some(cb) = upd.callback_query {
                self.handle_callback(cb).await;
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
                     ➕ Oddiy matn yozsangiz — yangi vazifa qo'shiladi (bugungi kunga).\n\
                     Vazifa eslatmalari belgilangan vaqtida avtomatik keladi.",
                )
                .await;
        } else if text.starts_with('/') {
            let _ = self
                .send_message(chat_id, "Noma'lum buyruq. /help ni ko'ring.")
                .await;
        } else {
            // Buyruq bo'lmagan matn — yangi vazifa sifatida qo'shamiz.
            self.add_task_from_text(chat_id, text).await;
        }
    }

    /// Botga yozilgan oddiy matndan bugungi kunga vazifa yaratadi.
    async fn add_task_from_text(&self, chat_id: i64, text: &str) {
        let uid = self.user_for_chat(chat_id).await;
        let Some(uid) = uid else {
            let _ = self
                .send_message(
                    chat_id,
                    "Avval hisobingizni ilovadan ulang (Sozlamalar → Telegram).",
                )
                .await;
            return;
        };
        let title = text.trim();
        if title.is_empty() {
            return;
        }
        let res = sqlx::query(
            "INSERT INTO tasks (title, user_id, due_date, position)
             VALUES ($1, $2, date_trunc('day', now()) + interval '23 hours 59 minutes',
                     COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE user_id = $2), 0))",
        )
        .bind(title)
        .bind(uid)
        .execute(&self.db)
        .await;
        let reply = match res {
            Ok(_) => format!("➕ Qo'shildi: <b>{}</b>", html_escape(title)),
            Err(_) => "❌ Vazifa qo'shilmadi.".to_string(),
        };
        let _ = self.send_message(chat_id, &reply).await;
    }

    /// Chatga bog'langan foydalanuvchi id'sini qaytaradi.
    async fn user_for_chat(&self, chat_id: i64) -> Option<Uuid> {
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE telegram_chat_id = $1")
            .bind(chat_id)
            .fetch_optional(&self.db)
            .await
            .ok()
            .flatten()
    }

    /// Inline tugma bosilganda — "done:<id>" vazifani bajarilgan deb belgilaydi.
    async fn handle_callback(&self, cb: CallbackQuery) {
        let Some(msg) = cb.message else { return };
        let chat_id = msg.chat.id;
        let data = cb.data.unwrap_or_default();

        let Some(id_str) = data.strip_prefix("done:") else {
            let _ = self.answer_callback(&cb.id, "").await;
            return;
        };
        let Ok(task_id) = Uuid::parse_str(id_str) else {
            let _ = self.answer_callback(&cb.id, "").await;
            return;
        };
        let Some(uid) = self.user_for_chat(chat_id).await else {
            let _ = self.answer_callback(&cb.id, "Hisob ulanmagan").await;
            return;
        };

        // Vazifani egaligini tekshirib olib kelamiz.
        let task = sqlx::query_as::<
            _,
            (
                String,
                Option<String>,
                Option<chrono::DateTime<chrono::Utc>>,
            ),
        >(
            "SELECT title, recurrence, due_date FROM tasks WHERE id = $1 AND user_id = $2"
        )
        .bind(task_id)
        .bind(uid)
        .fetch_optional(&self.db)
        .await
        .ok()
        .flatten();

        let Some((title, recurrence, due)) = task else {
            let _ = self.answer_callback(&cb.id, "Topilmadi").await;
            return;
        };

        // Takrorlanuvchi bo'lsa — keyingi muddatga suramiz, aks holda bajarilgan.
        let toast = match (recurrence.as_deref(), due) {
            (Some(rule), Some(d)) => {
                let next = crate::routes::tasks::next_occurrence(d, rule);
                let _ = sqlx::query(
                    "UPDATE tasks SET due_date = $2, reminder_sent = false, updated_at = now() WHERE id = $1",
                )
                .bind(task_id)
                .bind(next)
                .execute(&self.db)
                .await;
                "🔁 Keyingi muddatga surildi"
            }
            _ => {
                let _ = sqlx::query(
                    "UPDATE tasks SET completed = true, completed_at = now(), updated_at = now() WHERE id = $1",
                )
                .bind(task_id)
                .execute(&self.db)
                .await;
                "✅ Bajarildi"
            }
        };

        let _ = self.answer_callback(&cb.id, toast).await;
        // Xabarni yangilaymiz (tugmani olib tashlab).
        let _ = self
            .edit_message(
                chat_id,
                msg.message_id,
                &format!("{toast}: <s>{}</s>", html_escape(&title)),
            )
            .await;
    }

    /// Inline tugma bosilishiga javob (kichik toast).
    async fn answer_callback(&self, callback_id: &str, text: &str) -> anyhow::Result<()> {
        let url = format!("{API_BASE}/bot{}/answerCallbackQuery", self.token);
        self.client
            .post(url)
            .json(&serde_json::json!({ "callback_query_id": callback_id, "text": text }))
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    /// Mavjud xabar matnini tahrirlaydi (tugmalarni olib tashlaydi).
    async fn edit_message(&self, chat_id: i64, message_id: i64, text: &str) -> anyhow::Result<()> {
        let url = format!("{API_BASE}/bot{}/editMessageText", self.token);
        self.client
            .post(url)
            .json(&serde_json::json!({
                "chat_id": chat_id,
                "message_id": message_id,
                "text": text,
                "parse_mode": "HTML",
            }))
            .send()
            .await?
            .error_for_status()?;
        Ok(())
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
            Ok(Some(_)) => {
                "✅ Hisobingiz ulandi! Endi vazifa eslatmalari shu yerga keladi.\n\n\
                            /today — bugungi vazifalar"
            }
            _ => "❌ Havola yaroqsiz yoki muddati oʻtgan.\nIlovadan yangi havola oling.",
        };
        let _ = self.send_message(chat_id, text).await;
    }

    /// `/today` — chatga bog'langan foydalanuvchining bugungi vazifalari.
    async fn send_today(&self, chat_id: i64) {
        let uid = self.user_for_chat(chat_id).await;

        let Some(uid) = uid else {
            let _ = self
                .send_message(
                    chat_id,
                    "Avval hisobingizni ilovadan ulang (Sozlamalar → Telegram).",
                )
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

    // ---------- Ertalabki xulosa ----------

    /// Har kuni belgilangan UTC soatida bog'langan foydalanuvchilarga bugungi
    /// vazifalar ro'yxatini yuboradi. Soat `TELEGRAM_DIGEST_HOUR` (0–23, standart 3 UTC).
    pub async fn run_digest(self: Arc<Self>) {
        let hour: u32 = std::env::var("TELEGRAM_DIGEST_HOUR")
            .ok()
            .and_then(|s| s.parse().ok())
            .filter(|h| *h < 24)
            .unwrap_or(3);
        let mut ticker = tokio::time::interval(Duration::from_secs(300));
        loop {
            ticker.tick().await;
            if chrono::Utc::now().hour() != hour {
                continue;
            }
            if let Err(e) = self.send_digests().await {
                tracing::warn!("Digest yuborishda xato: {e:?}");
            }
        }
    }

    async fn send_digests(&self) -> anyhow::Result<()> {
        // Bugun hali xulosa olmagan, ulangan foydalanuvchilar.
        let rows = sqlx::query_as::<_, (Uuid, i64)>(
            "SELECT id, telegram_chat_id FROM users
              WHERE telegram_chat_id IS NOT NULL
                AND (telegram_digest_date IS NULL OR telegram_digest_date < now()::date)
              LIMIT 200",
        )
        .fetch_all(&self.db)
        .await?;

        for (uid, chat_id) in rows {
            // Sanani darhol belgilaymiz — takror yubormaslik uchun.
            let _ =
                sqlx::query("UPDATE users SET telegram_digest_date = now()::date WHERE id = $1")
                    .bind(uid)
                    .execute(&self.db)
                    .await;
            self.send_today(chat_id).await;
        }
        Ok(())
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
            match self.send_with_done_button(r.chat_id, &text, r.id).await {
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
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
