//! Web Push (VAPID) — brauzer push bildirishnomalari.
//!
//! - Server VAPID **maxfiy kalitini** `VAPID_PRIVATE_KEY` (base64url, xom 32 bayt)
//!   dan oladi; ochiq kalitni undan hosil qiladi va `/api/push/vapid` orqali beradi.
//! - Frontend `pushManager.subscribe(applicationServerKey)` bilan obuna bo'lib,
//!   obunani `/api/push/subscribe` ga saqlaydi.
//! - Eslatma vaqti yetganda `reminders` moduli shu yerdagi `send_to_user` ni chaqiradi.
//!
//! `VAPID_PRIVATE_KEY` berilmasa modul o'chiq (push endpointlari 404 beradi).

use std::sync::Arc;

use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::Engine;
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;
use web_push::{
    ContentEncoding, HyperWebPushClient, SubscriptionInfo, VapidSignatureBuilder, WebPushClient,
    WebPushError, WebPushMessageBuilder,
};

use crate::AppState;
use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};

pub struct WebPush {
    private_b64: String,
    public_b64: String,
    subject: String,
    client: HyperWebPushClient,
}

impl WebPush {
    /// `VAPID_PRIVATE_KEY` berilgan bo'lsa modulni yoqadi. Ochiq kalit maxfiydan hosil qilinadi.
    pub fn from_env() -> Option<Arc<Self>> {
        let private_b64 = std::env::var("VAPID_PRIVATE_KEY").ok()?.trim().to_string();
        if private_b64.is_empty() {
            return None;
        }
        // Maxfiy kalitni tekshirib, ochiq kalitni hosil qilamiz.
        let partial = match VapidSignatureBuilder::from_base64_no_sub(&private_b64) {
            Ok(p) => p,
            Err(_) => {
                tracing::warn!("VAPID_PRIVATE_KEY yaroqsiz — Web Push o'chirildi");
                return None;
            }
        };
        let public_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(partial.get_public_key());
        let subject =
            std::env::var("VAPID_SUBJECT").unwrap_or_else(|_| "mailto:admin@challanger.app".into());

        Some(Arc::new(Self {
            private_b64,
            public_b64,
            subject,
            client: HyperWebPushClient::new(),
        }))
    }

    pub fn public_key(&self) -> &str {
        &self.public_b64
    }

    /// Bitta obunaga yuboradi. `Ok(false)` — obuna endi yaroqsiz (o'chirilishi kerak).
    async fn send_one(
        &self,
        endpoint: &str,
        p256dh: &str,
        auth: &str,
        payload: &[u8],
    ) -> Result<bool, ()> {
        let info = SubscriptionInfo::new(endpoint, p256dh, auth);
        let mut sig = VapidSignatureBuilder::from_base64(&self.private_b64, &info).map_err(|_| ())?;
        sig.add_claim("sub", self.subject.as_str());
        let signature = sig.build().map_err(|_| ())?;

        let mut builder = WebPushMessageBuilder::new(&info);
        builder.set_payload(ContentEncoding::Aes128Gcm, payload);
        builder.set_vapid_signature(signature);
        builder.set_ttl(24 * 3600);
        let msg = builder.build().map_err(|_| ())?;

        match self.client.send(msg).await {
            Ok(()) => Ok(true),
            // 404/410 — obuna bekor qilingan: bazadan o'chiramiz.
            Err(WebPushError::EndpointNotValid(_)) | Err(WebPushError::EndpointNotFound(_)) => {
                Ok(false)
            }
            Err(e) => {
                tracing::warn!("Push yuborishda xato: {e:?}");
                Err(())
            }
        }
    }

    /// Foydalanuvchining barcha obunalariga yuboradi; yaroqsizlarni o'chiradi.
    pub async fn send_to_user(&self, db: &PgPool, user_id: Uuid, title: &str, body: &str) {
        let subs = sqlx::query_as::<_, (Uuid, String, String, String)>(
            "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_all(db)
        .await
        .unwrap_or_default();

        if subs.is_empty() {
            return;
        }
        let payload = serde_json::json!({ "title": title, "body": body }).to_string();
        let bytes = payload.as_bytes();

        for (id, endpoint, p256dh, auth) in subs {
            if let Ok(false) = self.send_one(&endpoint, &p256dh, &auth, bytes).await {
                let _ = sqlx::query("DELETE FROM push_subscriptions WHERE id = $1")
                    .bind(id)
                    .execute(db)
                    .await;
            }
        }
    }
}

// ---------- Router ----------

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/push/vapid", get(vapid_key))
        .route("/push/subscribe", post(subscribe))
        .route("/push/unsubscribe", post(unsubscribe))
}

/// Frontend `applicationServerKey` sifatida ishlatadigan ochiq VAPID kaliti.
async fn vapid_key(State(st): State<AppState>) -> AppResult<Json<serde_json::Value>> {
    match &st.push {
        Some(wp) => Ok(Json(serde_json::json!({ "key": wp.public_key() }))),
        None => Err(AppError::NotFound),
    }
}

#[derive(Deserialize)]
struct SubKeys {
    p256dh: String,
    auth: String,
}

#[derive(Deserialize)]
struct SubscribeBody {
    endpoint: String,
    keys: SubKeys,
}

async fn subscribe(
    State(st): State<AppState>,
    user: AuthUser,
    Json(body): Json<SubscribeBody>,
) -> AppResult<Json<serde_json::Value>> {
    if st.push.is_none() {
        return Err(AppError::NotFound);
    }
    if body.endpoint.trim().is_empty() || body.keys.p256dh.is_empty() || body.keys.auth.is_empty() {
        return Err(AppError::BadRequest("obuna ma'lumotlari to'liq emas".into()));
    }
    sqlx::query(
        "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, endpoint)
         DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth",
    )
    .bind(user.id)
    .bind(body.endpoint.trim())
    .bind(&body.keys.p256dh)
    .bind(&body.keys.auth)
    .execute(&st.db)
    .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
struct UnsubBody {
    endpoint: String,
}

async fn unsubscribe(
    State(st): State<AppState>,
    user: AuthUser,
    Json(body): Json<UnsubBody>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2")
        .bind(user.id)
        .bind(body.endpoint.trim())
        .execute(&st.db)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}
