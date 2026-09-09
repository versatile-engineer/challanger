use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Datelike, Duration, Utc};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::models::{CreateTask, ReorderTasks, Task, TaskQuery, UpdateTask};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tasks", get(list).post(create))
        .route("/tasks/reorder", post(reorder))
        .route("/tasks/:id", get(get_one).patch(update).delete(delete))
        .route("/tasks/:id/complete", post(complete))
}

/// Vazifalarni drag-and-drop tartibiga ko'ra qayta raqamlaydi.
/// Berilgan id'lar 0,1,2,... `position` qiymatlarini oladi — bitta tranzaksiyada.
async fn reorder(
    State(st): State<AppState>,
    user: AuthUser,
    Json(body): Json<ReorderTasks>,
) -> AppResult<Json<serde_json::Value>> {
    if body.ids.len() > 1000 {
        return Err(AppError::BadRequest("juda ko'p element".into()));
    }
    let mut tx = st.db.begin().await?;
    for (i, id) in body.ids.iter().enumerate() {
        sqlx::query(
            "UPDATE tasks SET position = $1, updated_at = now() WHERE id = $2 AND user_id = $3",
        )
        .bind(i as f64)
        .bind(id)
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn list(
    State(st): State<AppState>,
    user: AuthUser,
    Query(q): Query<TaskQuery>,
) -> AppResult<Json<Vec<Task>>> {
    // QueryBuilder — barcha foydalanuvchi qiymatlari bind qilinadi (SQL-injection'siz).
    let mut qb = sqlx::QueryBuilder::<sqlx::Postgres>::new("SELECT * FROM tasks WHERE user_id = ");
    qb.push_bind(user.id);

    if let Some(pid) = q.project_id {
        qb.push(" AND project_id = ").push_bind(pid);
    }
    if let Some(c) = q.completed {
        qb.push(" AND completed = ").push_bind(c);
    }
    if let Some(p) = q.priority {
        qb.push(" AND priority = ").push_bind(p.clamp(0, 3));
    }
    if let Some(tag) = q.tag.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        qb.push(" AND ")
            .push_bind(tag.to_lowercase())
            .push(" = ANY(tags)");
    }
    if let Some(term) = q.search.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        // Sarlavha yoki izohda qidiruv (harf registriga sezgir emas).
        let pattern = format!("%{}%", term.replace('%', "\\%").replace('_', "\\_"));
        qb.push(" AND (title ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR notes ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
    match q.view.as_deref() {
        Some("today") => {
            qb.push(" AND due_date::date = now()::date AND completed = false");
        }
        Some("overdue") => {
            qb.push(" AND due_date < now() AND completed = false");
        }
        Some("upcoming") => {
            qb.push(" AND due_date >= now() AND completed = false");
        }
        _ => {}
    }
    qb.push(" ORDER BY completed, priority DESC, due_date NULLS LAST, position, created_at");

    // Pagination (limit 1..=500, offset >= 0)
    if let Some(limit) = q.limit {
        qb.push(" LIMIT ").push_bind(limit.clamp(1, 500));
    }
    if let Some(offset) = q.offset {
        qb.push(" OFFSET ").push_bind(offset.max(0));
    }

    let rows = qb.build_query_as::<Task>().fetch_all(&st.db).await?;
    Ok(Json(rows))
}

async fn get_one(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Task>> {
    let row = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.id)
        .fetch_optional(&st.db)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(row))
}

async fn create(
    State(st): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateTask>,
) -> AppResult<Json<Task>> {
    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest(
            "sarlavha bo'sh bo'lishi mumkin emas".into(),
        ));
    }
    let row = sqlx::query_as::<_, Task>(
        "INSERT INTO tasks (title, project_id, notes, due_date, priority, recurrence, reminder_at, position, user_id, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE user_id = $8), 0),
                 $8, $9)
         RETURNING *",
    )
    .bind(body.title.trim())
    .bind(body.project_id)
    .bind(body.notes)
    .bind(body.due_date)
    .bind(body.priority.clamp(0, 3))
    .bind(body.recurrence)
    .bind(body.reminder_at)
    .bind(user.id)
    .bind(normalize_tags(body.tags))
    .fetch_one(&st.db)
    .await?;
    Ok(Json(row))
}

async fn update(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateTask>,
) -> AppResult<Json<Task>> {
    // COALESCE + double_option: `Some(None)` => NULLga o'rnatish, `None` => tegmaslik.
    let row = sqlx::query_as::<_, Task>(
        "UPDATE tasks SET
            title       = COALESCE($3, title),
            notes       = COALESCE($4, notes),
            completed   = COALESCE($5, completed),
            completed_at = CASE
                WHEN $5 IS TRUE  THEN now()
                WHEN $5 IS FALSE THEN NULL
                ELSE completed_at END,
            project_id  = CASE WHEN $6 THEN $7 ELSE project_id END,
            due_date    = CASE WHEN $8 THEN $9 ELSE due_date END,
            priority    = COALESCE($10, priority),
            recurrence  = CASE WHEN $11 THEN $12 ELSE recurrence END,
            reminder_at = CASE WHEN $13 THEN $14 ELSE reminder_at END,
            -- Eslatma vaqti o'zgartirilsa — qayta yuborishga tayyorlaymiz
            reminder_sent = CASE WHEN $13 THEN false ELSE reminder_sent END,
            eisenhower  = CASE WHEN $16 THEN $17 ELSE eisenhower END,
            position    = COALESCE($15, position),
            tags        = COALESCE($18, tags),
            updated_at  = now()
         WHERE id = $1 AND user_id = $2
         RETURNING *",
    )
    .bind(id)
    .bind(user.id)
    .bind(body.title)
    .bind(body.notes)
    .bind(body.completed)
    .bind(body.project_id.is_some())
    .bind(body.project_id.flatten())
    .bind(body.due_date.is_some())
    .bind(body.due_date.flatten())
    .bind(body.priority.map(|p| p.clamp(0, 3)))
    .bind(body.recurrence.is_some())
    .bind(body.recurrence.flatten())
    .bind(body.reminder_at.is_some())
    .bind(body.reminder_at.flatten())
    .bind(body.position)
    .bind(body.eisenhower.is_some())
    .bind(body.eisenhower.flatten())
    .bind(body.tags.map(normalize_tags))
    .fetch_optional(&st.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(row))
}

/// Vazifani bajarilgan deb belgilash.
/// Agar takrorlanuvchi bo'lsa — bajarilgan deb belgilanmaydi,
/// balki muddati keyingi takrorga suriladi.
async fn complete(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Task>> {
    let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.id)
        .fetch_optional(&st.db)
        .await?
        .ok_or(AppError::NotFound)?;

    match (&task.recurrence, task.due_date) {
        (Some(rule), Some(due)) => {
            let next = next_occurrence(due, rule);
            let next_reminder = task.reminder_at.map(|r| r + (next - due));
            let row = sqlx::query_as::<_, Task>(
                "UPDATE tasks SET due_date = $2, reminder_at = $3, reminder_sent = false, updated_at = now()
                 WHERE id = $1 RETURNING *",
            )
            .bind(id)
            .bind(next)
            .bind(next_reminder)
            .fetch_one(&st.db)
            .await?;
            Ok(Json(row))
        }
        _ => {
            let row = sqlx::query_as::<_, Task>(
                "UPDATE tasks SET completed = true, completed_at = now(), updated_at = now()
                 WHERE id = $1 RETURNING *",
            )
            .bind(id)
            .fetch_one(&st.db)
            .await?;
            Ok(Json(row))
        }
    }
}

async fn delete(
    State(st): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let res = sqlx::query("DELETE FROM tasks WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.id)
        .execute(&st.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Teglarni tozalaydi: kichik harf, bo'shliqsiz, takrorsiz, ko'pi bilan 10 ta.
fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for t in tags {
        let t = t.trim().to_lowercase().replace(' ', "-");
        if !t.is_empty() && !out.contains(&t) {
            out.push(t);
        }
        if out.len() >= 10 {
            break;
        }
    }
    out
}

/// Oddiy takrorlanish qoidasi bo'yicha keyingi sanani hisoblaydi.
pub(crate) fn next_occurrence(from: DateTime<Utc>, rule: &str) -> DateTime<Utc> {
    use chrono::Weekday;
    match rule {
        "daily" => from + Duration::days(1),
        "weekdays" => {
            // Keyingi ish kuni — dam olish kunlarini o'tkazib yuboradi.
            let mut d = from + Duration::days(1);
            while matches!(d.weekday(), Weekday::Sat | Weekday::Sun) {
                d += Duration::days(1);
            }
            d
        }
        "weekly" => from + Duration::weeks(1),
        "biweekly" => from + Duration::weeks(2),
        "monthly" => add_months(from, 1),
        "yearly" => add_months(from, 12),
        _ => from + Duration::days(1),
    }
}

/// Oylarni qo'shish (kun oyning oxiridan oshib ketsa, oy oxiriga tushiriladi).
fn add_months(dt: DateTime<Utc>, months: i32) -> DateTime<Utc> {
    let mut year = dt.year();
    let mut month0 = dt.month0() as i32 + months;
    year += month0.div_euclid(12);
    month0 = month0.rem_euclid(12);
    let month = month0 as u32 + 1;
    let last_day = days_in_month(year, month);
    let day = dt.day().min(last_day);
    dt.with_day(1)
        .and_then(|d| d.with_year(year))
        .and_then(|d| d.with_month(month))
        .and_then(|d| d.with_day(day))
        .unwrap_or(dt)
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let (ny, nm) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    let first_next = chrono::NaiveDate::from_ymd_opt(ny, nm, 1).unwrap();
    let first_this = chrono::NaiveDate::from_ymd_opt(year, month, 1).unwrap();
    (first_next - first_this).num_days() as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn utc(y: i32, m: u32, d: u32, h: u32, min: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, m, d, h, min, 0).unwrap()
    }

    #[test]
    fn daily_adds_one_day() {
        let from = utc(2026, 9, 5, 12, 0);
        assert_eq!(next_occurrence(from, "daily"), utc(2026, 9, 6, 12, 0));
    }

    #[test]
    fn weekly_adds_seven_days() {
        let from = utc(2026, 9, 5, 12, 0);
        assert_eq!(next_occurrence(from, "weekly"), utc(2026, 9, 12, 12, 0));
    }

    #[test]
    fn biweekly_adds_fourteen_days() {
        let from = utc(2026, 9, 5, 12, 0);
        assert_eq!(next_occurrence(from, "biweekly"), utc(2026, 9, 19, 12, 0));
    }

    #[test]
    fn weekdays_skips_weekend() {
        // Juma (2026-09-04) -> keyingi ish kuni dushanba (2026-09-07)
        let friday = utc(2026, 9, 4, 9, 0);
        assert_eq!(next_occurrence(friday, "weekdays"), utc(2026, 9, 7, 9, 0));
        // Dushanba -> seshanba
        let monday = utc(2026, 9, 7, 9, 0);
        assert_eq!(next_occurrence(monday, "weekdays"), utc(2026, 9, 8, 9, 0));
    }

    #[test]
    fn monthly_clamps_to_month_end() {
        // 31-yanvar + 1 oy -> 28-fevral (2026 kabisa yili emas)
        let from = utc(2026, 1, 31, 9, 0);
        assert_eq!(next_occurrence(from, "monthly"), utc(2026, 2, 28, 9, 0));
    }

    #[test]
    fn monthly_wraps_year() {
        let from = utc(2026, 12, 15, 9, 0);
        assert_eq!(next_occurrence(from, "monthly"), utc(2027, 1, 15, 9, 0));
    }

    #[test]
    fn yearly_adds_twelve_months() {
        let from = utc(2026, 6, 10, 8, 30);
        assert_eq!(next_occurrence(from, "yearly"), utc(2027, 6, 10, 8, 30));
    }

    #[test]
    fn days_in_month_correct() {
        assert_eq!(days_in_month(2026, 2), 28);
        assert_eq!(days_in_month(2024, 2), 29); // kabisa yili
        assert_eq!(days_in_month(2026, 4), 30);
        assert_eq!(days_in_month(2026, 12), 31);
    }

    #[test]
    fn normalize_tags_lowercases_dedups_and_limits() {
        let tags = normalize_tags(vec![
            "  Ish ".into(),
            "ISH".into(),
            "muhim narsa".into(),
            "".into(),
        ]);
        assert_eq!(tags, vec!["ish", "muhim-narsa"]);
    }

    #[test]
    fn normalize_tags_caps_at_ten() {
        let many: Vec<String> = (0..20).map(|i| format!("tag{i}")).collect();
        assert_eq!(normalize_tags(many).len(), 10);
    }
}
