//! Integratsiya testlari — funksional to'g'rilik (IDOR emas, "feature ishlayaptimi").
//!
//! Qisman yangilash semantikasi, takrorlanuvchi vazifa oqimi, validatsiya xatolari
//! va odat toggle idempotentligini tekshiradi.

mod common;

use axum::http::StatusCode;
use common::*;
use serde_json::json;
use sqlx::PgPool;

// ------------------------- Qisman yangilash (PATCH) -------------------------

#[sqlx::test]
async fn partial_update_preserves_untouched_fields(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;
    let task = create_task_full(
        &app,
        &alice,
        json!({
            "title": "boshlang'ich",
            "notes": "eslatma matni",
            "due_date": "2026-09-15T10:00:00Z",
            "priority": 2,
        }),
    )
    .await;
    let id = task["id"].as_str().unwrap();

    // Faqat sarlavhani yangilaymiz — qolganlari o'zgarmasligi kerak.
    let (st, v) = call(
        &app,
        "PATCH",
        &format!("/api/tasks/{id}"),
        Some(&alice),
        Some(json!({ "title": "yangilangan" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK, "{v:?}");
    assert_eq!(v["title"], "yangilangan");
    assert_eq!(v["notes"], "eslatma matni", "izoh o'chib ketmasligi kerak");
    assert_eq!(v["priority"], 2, "prioritet saqlanishi kerak");
    assert!(
        v["due_date"].is_string(),
        "muddat saqlanishi kerak, topildi: {:?}",
        v["due_date"]
    );
}

#[sqlx::test]
async fn partial_update_can_clear_due_date_with_null(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;
    let task = create_task_full(
        &app,
        &alice,
        json!({ "title": "muddatli", "due_date": "2026-09-15T10:00:00Z" }),
    )
    .await;
    let id = task["id"].as_str().unwrap();

    // `null` yuborilsa — muddat tozalanadi (double_option Some(None)).
    let (st, v) = call(
        &app,
        "PATCH",
        &format!("/api/tasks/{id}"),
        Some(&alice),
        Some(json!({ "due_date": null })),
    )
    .await;
    assert_eq!(st, StatusCode::OK, "{v:?}");
    assert!(v["due_date"].is_null(), "muddat null bo'lishi kerak");
}

#[sqlx::test]
async fn completing_and_uncompleting_updates_completed_at(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;
    let id = create_task(&app, &alice, "vazifa").await;

    let (_, v) = call(
        &app,
        "PATCH",
        &format!("/api/tasks/{id}"),
        Some(&alice),
        Some(json!({ "completed": true })),
    )
    .await;
    assert_eq!(v["completed"], true);
    assert!(
        v["completed_at"].is_string(),
        "completed_at o'rnatilishi kerak"
    );

    let (_, v) = call(
        &app,
        "PATCH",
        &format!("/api/tasks/{id}"),
        Some(&alice),
        Some(json!({ "completed": false })),
    )
    .await;
    assert_eq!(v["completed"], false);
    assert!(
        v["completed_at"].is_null(),
        "completed_at tozalanishi kerak"
    );
}

// ------------------------- Takrorlanuvchi vazifa -------------------------

#[sqlx::test]
async fn completing_recurring_task_advances_due_date(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;
    let task = create_task_full(
        &app,
        &alice,
        json!({ "title": "kunlik", "due_date": "2026-09-15T10:00:00Z", "recurrence": "daily" }),
    )
    .await;
    let id = task["id"].as_str().unwrap();

    // Takrorlanuvchi vazifa "bajarildi" bo'lmaydi — muddati keyingi kunga suriladi.
    let (st, v) = call(
        &app,
        "POST",
        &format!("/api/tasks/{id}/complete"),
        Some(&alice),
        None,
    )
    .await;
    assert_eq!(st, StatusCode::OK, "{v:?}");
    assert_eq!(v["completed"], false, "takrorlanuvchi bajarilgan bo'lmaydi");
    assert!(
        v["due_date"].as_str().unwrap().starts_with("2026-09-16"),
        "muddat keyingi kunga surilishi kerak, topildi: {:?}",
        v["due_date"]
    );
}

#[sqlx::test]
async fn completing_normal_task_marks_it_done(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;
    let id = create_task(&app, &alice, "bir martalik").await;

    let (st, v) = call(
        &app,
        "POST",
        &format!("/api/tasks/{id}/complete"),
        Some(&alice),
        None,
    )
    .await;
    assert_eq!(st, StatusCode::OK, "{v:?}");
    assert_eq!(v["completed"], true);
    assert!(v["completed_at"].is_string());
}

// ------------------------- Validatsiya (400) -------------------------

#[sqlx::test]
async fn signup_rejects_invalid_input(pool: PgPool) {
    let app = app_with(pool);

    // Zaif parol (< 6).
    let (st, _) = call(
        &app,
        "POST",
        "/api/auth/signup",
        None,
        Some(json!({ "username": "aaa", "email": "a@b.com", "password": "123" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST, "zaif parol rad etilishi kerak");

    // Noto'g'ri email (@ yo'q).
    let (st, _) = call(
        &app,
        "POST",
        "/api/auth/signup",
        None,
        Some(json!({ "username": "bbb", "email": "notanemail", "password": "parol123" })),
    )
    .await;
    assert_eq!(
        st,
        StatusCode::BAD_REQUEST,
        "noto'g'ri email rad etilishi kerak"
    );

    // Juda qisqa username (< 3 belgi). (Eslatma: katta harf rad etilmaydi —
    // signup avval kichik harfga o'tkazadi, bu ataylab shunday.)
    let (st, _) = call(
        &app,
        "POST",
        "/api/auth/signup",
        None,
        Some(json!({ "username": "ab", "email": "c@b.com", "password": "parol123" })),
    )
    .await;
    assert_eq!(
        st,
        StatusCode::BAD_REQUEST,
        "juda qisqa username rad etilishi kerak"
    );
}

#[sqlx::test]
async fn signup_rejects_duplicate_username(pool: PgPool) {
    let app = app_with(pool);
    signup(&app, "alice").await;
    // Xuddi shu username bilan ikkinchi marta — 400.
    let (st, _) = call(
        &app,
        "POST",
        "/api/auth/signup",
        None,
        Some(json!({ "username": "alice", "email": "boshqa@b.com", "password": "parol123" })),
    )
    .await;
    assert_eq!(
        st,
        StatusCode::BAD_REQUEST,
        "takroriy username rad etilishi kerak"
    );
}

#[sqlx::test]
async fn create_rejects_bad_input(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;

    // Bo'sh sarlavha.
    let (st, _) = call(
        &app,
        "POST",
        "/api/tasks",
        Some(&alice),
        Some(json!({ "title": "   " })),
    )
    .await;
    assert_eq!(
        st,
        StatusCode::BAD_REQUEST,
        "bo'sh sarlavha rad etilishi kerak"
    );

    // Noto'g'ri rang formati.
    let (st, _) = call(
        &app,
        "POST",
        "/api/projects",
        Some(&alice),
        Some(json!({ "name": "Loyiha", "color": "qizil" })),
    )
    .await;
    assert_eq!(
        st,
        StatusCode::BAD_REQUEST,
        "noto'g'ri rang rad etilishi kerak"
    );
}

// ------------------------- Odat toggle idempotentligi -------------------------

#[sqlx::test]
async fn habit_toggle_is_idempotent(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;
    let (st, v) = call(
        &app,
        "POST",
        "/api/habits",
        Some(&alice),
        Some(json!({ "name": "Suv ichish" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK, "{v:?}");
    let hid = v["id"].as_str().unwrap();
    let today = chrono::Utc::now().date_naive().to_string();

    // Birinchi toggle — belgilanadi.
    let (st, v) = call(
        &app,
        "POST",
        &format!("/api/habits/{hid}/toggle"),
        Some(&alice),
        Some(json!({ "day": today })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(v["done"], true, "birinchi toggle belgilashi kerak");

    // Ikkinchi toggle — belgi olib tashlanadi.
    let (st, v) = call(
        &app,
        "POST",
        &format!("/api/habits/{hid}/toggle"),
        Some(&alice),
        Some(json!({ "day": today })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(
        v["done"], false,
        "ikkinchi toggle belgini olib tashlashi kerak"
    );
}
