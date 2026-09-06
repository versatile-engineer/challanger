//! iCalendar (.ics) feed — tashqi kalendarlarga (Google/Apple/Outlook) obuna.
//!
//! - `POST /calendar/token` (auth) — feed tokenini yoqadi/qaytaradi.
//! - `DELETE /calendar/token` (auth) — tokenni yangilaydi (eski havola ishlamay qoladi).
//! - `GET /calendar/:file` — `<token>.ics`, autentifikatsiyasiz (token o'zi kalit).

use axum::extract::{Path, State};
use axum::http::header;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/calendar/token", post(enable).delete(regenerate))
        .route("/calendar/:file", get(feed))
}

#[derive(sqlx::FromRow)]
struct FeedTask {
    id: Uuid,
    title: String,
    notes: String,
    due_date: Option<DateTime<Utc>>,
    completed: bool,
    priority: i16,
    recurrence: Option<String>,
    updated_at: DateTime<Utc>,
}

/// Feed tokenini yaratadi (bo'lmasa) va to'liq havolani qaytaradi.
async fn enable(State(st): State<AppState>, user: AuthUser) -> AppResult<Json<serde_json::Value>> {
    let token = Uuid::new_v4().simple().to_string();
    // Faqat token yo'q bo'lsa yangisini o'rnatamiz (bor bo'lsa — tegmaymiz).
    let current = sqlx::query_scalar::<_, Option<String>>(
        "UPDATE users SET calendar_token = COALESCE(calendar_token, $2)
         WHERE id = $1 RETURNING calendar_token",
    )
    .bind(user.id)
    .bind(&token)
    .fetch_one(&st.db)
    .await?;
    Ok(Json(feed_response(current)))
}

/// Tokenni yangilaydi — eski obuna havolasi ishlamay qoladi.
async fn regenerate(
    State(st): State<AppState>,
    user: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let token = Uuid::new_v4().simple().to_string();
    let current = sqlx::query_scalar::<_, Option<String>>(
        "UPDATE users SET calendar_token = $2 WHERE id = $1 RETURNING calendar_token",
    )
    .bind(user.id)
    .bind(&token)
    .fetch_one(&st.db)
    .await?;
    Ok(Json(feed_response(current)))
}

fn feed_response(token: Option<String>) -> serde_json::Value {
    match token {
        Some(t) => serde_json::json!({ "path": format!("/api/calendar/{t}.ics") }),
        None => serde_json::json!({ "path": null }),
    }
}

/// `<token>.ics` — kalendar dasturi shu yo'lga obuna bo'ladi.
async fn feed(State(st): State<AppState>, Path(file): Path<String>) -> AppResult<Response> {
    let token = file.strip_suffix(".ics").unwrap_or(&file);
    if token.is_empty() {
        return Err(AppError::NotFound);
    }

    let uid = sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE calendar_token = $1")
        .bind(token)
        .fetch_optional(&st.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let tasks = sqlx::query_as::<_, FeedTask>(
        "SELECT id, title, notes, due_date, completed, priority, recurrence, updated_at
           FROM tasks
          WHERE user_id = $1 AND due_date IS NOT NULL
          ORDER BY due_date",
    )
    .bind(uid)
    .fetch_all(&st.db)
    .await?;

    let body = build_ics(&tasks);
    Ok((
        [
            (header::CONTENT_TYPE, "text/calendar; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "inline; filename=\"challanger.ics\"",
            ),
        ],
        body,
    )
        .into_response())
}

fn build_ics(tasks: &[FeedTask]) -> String {
    let mut s = String::from(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Challanger//Tasks//UZ\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:Challanger\r\nMETHOD:PUBLISH\r\n",
    );
    for t in tasks {
        let Some(due) = t.due_date else { continue };
        let dt = due.format("%Y%m%dT%H%M%SZ").to_string();
        let stamp = t.updated_at.format("%Y%m%dT%H%M%SZ").to_string();
        let prefix = if t.completed { "✅ " } else { "" };
        let summary = ics_escape(&format!("{prefix}{}", t.title));

        s.push_str("BEGIN:VEVENT\r\n");
        s.push_str(&format!("UID:{}@challanger\r\n", t.id));
        s.push_str(&format!("DTSTAMP:{stamp}\r\n"));
        s.push_str(&format!("DTSTART:{dt}\r\n"));
        // 30 daqiqalik standart davomiylik
        s.push_str("DURATION:PT30M\r\n");
        s.push_str(&format!("SUMMARY:{summary}\r\n"));
        if !t.notes.trim().is_empty() {
            s.push_str(&format!("DESCRIPTION:{}\r\n", ics_escape(&t.notes)));
        }
        if let Some(rrule) = rrule_for(t.recurrence.as_deref()) {
            s.push_str(&format!("RRULE:{rrule}\r\n"));
        }
        if t.completed {
            s.push_str("STATUS:CONFIRMED\r\n");
        }
        // Prioritet: iCal 1 (yuqori) .. 9 (past); bizda 3 (yuqori) .. 0
        let ical_priority = match t.priority {
            3 => 1,
            2 => 5,
            1 => 7,
            _ => 0,
        };
        if ical_priority > 0 {
            s.push_str(&format!("PRIORITY:{ical_priority}\r\n"));
        }
        s.push_str("END:VEVENT\r\n");
    }
    s.push_str("END:VCALENDAR\r\n");
    s
}

fn rrule_for(recurrence: Option<&str>) -> Option<String> {
    let rule = match recurrence? {
        "daily" => "FREQ=DAILY",
        "weekdays" => "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
        "weekly" => "FREQ=WEEKLY",
        "biweekly" => "FREQ=WEEKLY;INTERVAL=2",
        "monthly" => "FREQ=MONTHLY",
        "yearly" => "FREQ=YEARLY",
        _ => return None,
    };
    Some(rule.to_string())
}

/// RFC 5545 bo'yicha matnni ekranlaydi.
fn ics_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace('\n', "\\n")
        .replace('\r', "")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_special_chars() {
        assert_eq!(ics_escape("a,b;c\nd"), "a\\,b\\;c\\nd");
    }

    #[test]
    fn rrule_mapping() {
        assert_eq!(rrule_for(Some("daily")).as_deref(), Some("FREQ=DAILY"));
        assert_eq!(rrule_for(Some("weekly")).as_deref(), Some("FREQ=WEEKLY"));
        assert_eq!(rrule_for(None), None);
        assert_eq!(rrule_for(Some("bogus")), None);
    }
}
