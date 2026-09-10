//! Integratsiya testlari — avtorizatsiya va egalik (IDOR) himoyasi.
//!
//! Har test uchun `#[sqlx::test]` vaqtinchalik toza baza yaratadi va migratsiyalarni
//! qo'llaydi. So'rovlar haqiqiy `axum` router orqali (`tower::oneshot`) o'tadi.
//!
//! Ishga tushirish (lokal): DATABASE_URL postgres serverga ishora qilsin, masalan
//!   DATABASE_URL=postgres://challanger:challanger@localhost:5433/challanger cargo test

mod common;

use axum::http::StatusCode;
use common::*;
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test]
async fn unauthenticated_requests_are_rejected(pool: PgPool) {
    let app = app_with(pool);
    let (st, _) = call(&app, "GET", "/api/tasks", None, None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
    let (st, _) = call(&app, "GET", "/api/auth/me", None, None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
    // Yaroqsiz token ham 401.
    let (st, _) = call(&app, "GET", "/api/tasks", Some("axlat-token"), None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn task_idor_is_blocked(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;
    let (bob, _) = signup(&app, "bob").await;
    let id = create_task(&app, &alice, "maxfiy vazifa").await;

    for (method, body) in [
        ("GET", None),
        ("PATCH", Some(json!({ "title": "buzildi" }))),
        ("DELETE", None),
    ] {
        let (st, _) = call(&app, method, &format!("/api/tasks/{id}"), Some(&bob), body).await;
        assert_eq!(
            st,
            StatusCode::NOT_FOUND,
            "{method} Bob uchun 404 bo'lishi kerak"
        );
    }

    // Egasi (Alice) esa hamon ko'ra oladi.
    let (st, _) = call(&app, "GET", &format!("/api/tasks/{id}"), Some(&alice), None).await;
    assert_eq!(st, StatusCode::OK);
}

#[sqlx::test]
async fn task_list_is_isolated_per_user(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;
    let (bob, _) = signup(&app, "bob").await;
    create_task(&app, &alice, "alice vazifasi").await;

    let (st, v) = call(&app, "GET", "/api/tasks", Some(&bob), None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(
        v.as_array().map(|a| a.len()),
        Some(0),
        "Bob ro'yxatida Alice vazifasi ko'rinmasligi kerak"
    );
}

#[sqlx::test]
async fn subtask_idor_is_blocked(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;
    let (bob, _) = signup(&app, "bob").await;
    let task = create_task(&app, &alice, "vazifa").await;

    let (st, _) = call(
        &app,
        "POST",
        &format!("/api/tasks/{task}/subtasks"),
        Some(&bob),
        Some(json!({ "title": "qadam" })),
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn project_idor_is_blocked(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;
    let (bob, _) = signup(&app, "bob").await;
    let (st, v) = call(
        &app,
        "POST",
        "/api/projects",
        Some(&alice),
        Some(json!({ "name": "Ish" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK, "{v:?}");
    let pid = v["id"].as_str().unwrap();

    let (st, _) = call(
        &app,
        "PATCH",
        &format!("/api/projects/{pid}"),
        Some(&bob),
        Some(json!({ "name": "bosib olindi" })),
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (st, _) = call(
        &app,
        "DELETE",
        &format!("/api/projects/{pid}"),
        Some(&bob),
        None,
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

// ------------------------- Guruh: a'zolik va rollar -------------------------

#[sqlx::test]
async fn group_non_member_is_blocked(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;
    let (bob, _) = signup(&app, "bob").await;
    let (gid, _code) = create_group(&app, &alice).await;

    let (st, _) = call(&app, "GET", &format!("/api/groups/{gid}"), Some(&bob), None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let (st, _) = call(
        &app,
        "POST",
        &format!("/api/groups/{gid}/habits"),
        Some(&bob),
        Some(json!({ "name": "Sport" })),
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn group_member_cannot_manage_but_owner_can(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;
    let (bob, _) = signup(&app, "bob").await;
    let (gid, code) = create_group(&app, &alice).await;
    let hid = create_group_habit(&app, &alice, &gid).await;

    // Bob taklif kodi bilan qo'shiladi (oddiy a'zo).
    let (st, _) = call(
        &app,
        "POST",
        "/api/groups/join",
        Some(&bob),
        Some(json!({ "code": code })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);

    // Oddiy a'zo odatni o'chira olmaydi (faqat ega/admin) — 400.
    let (st, _) = call(
        &app,
        "DELETE",
        &format!("/api/groups/{gid}/habits/{hid}"),
        Some(&bob),
        None,
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Oddiy a'zo boshqa a'zo qo'sha olmaydi (faqat ega) — 400.
    let (st, _) = call(
        &app,
        "POST",
        &format!("/api/groups/{gid}/members"),
        Some(&bob),
        Some(json!({ "username": "carol" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Ega esa o'chira oladi — 200.
    let (st, _) = call(
        &app,
        "DELETE",
        &format!("/api/groups/{gid}/habits/{hid}"),
        Some(&alice),
        None,
    )
    .await;
    assert_eq!(st, StatusCode::OK);
}

#[sqlx::test]
async fn group_admin_promotion_grants_manage(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;
    let (bob, bob_id) = signup(&app, "bob").await;
    let (gid, code) = create_group(&app, &alice).await;
    let hid = create_group_habit(&app, &alice, &gid).await;
    call(
        &app,
        "POST",
        "/api/groups/join",
        Some(&bob),
        Some(json!({ "code": code })),
    )
    .await;

    // Ega Bob'ni admin qiladi.
    let (st, _) = call(
        &app,
        "POST",
        &format!("/api/groups/{gid}/members/{bob_id}/role"),
        Some(&alice),
        Some(json!({ "role": "admin" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK);

    // Endi Bob (admin) odatni o'chira oladi.
    let (st, _) = call(
        &app,
        "DELETE",
        &format!("/api/groups/{gid}/habits/{hid}"),
        Some(&bob),
        None,
    )
    .await;
    assert_eq!(st, StatusCode::OK);
}

#[sqlx::test]
async fn group_task_toggle_requires_membership(pool: PgPool) {
    let app = app_with(pool);
    let (alice, _) = signup(&app, "alice").await;
    let (bob, _) = signup(&app, "bob").await;
    let (gid, _code) = create_group(&app, &alice).await;
    let (st, v) = call(
        &app,
        "POST",
        &format!("/api/groups/{gid}/tasks"),
        Some(&alice),
        Some(json!({ "title": "Umumiy ish" })),
    )
    .await;
    assert_eq!(st, StatusCode::OK, "{v:?}");
    let tid = v["id"].as_str().unwrap();

    let (st, _) = call(
        &app,
        "POST",
        &format!("/api/group-tasks/{tid}/toggle"),
        Some(&bob),
        None,
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}
