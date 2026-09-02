use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub color: String,
    pub position: f64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProject {
    pub name: String,
    #[serde(default = "default_color")]
    pub color: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProject {
    pub name: Option<String>,
    pub color: Option<String>,
    pub position: Option<f64>,
}

fn default_color() -> String {
    "#4f46e5".to_string()
}

#[derive(Debug, Serialize, FromRow)]
pub struct Task {
    pub id: Uuid,
    pub project_id: Option<Uuid>,
    pub title: String,
    pub notes: String,
    pub completed: bool,
    pub completed_at: Option<DateTime<Utc>>,
    pub due_date: Option<DateTime<Utc>>,
    pub priority: i16,
    pub recurrence: Option<String>,
    pub reminder_at: Option<DateTime<Utc>>,
    pub position: f64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTask {
    pub title: String,
    pub project_id: Option<Uuid>,
    #[serde(default)]
    pub notes: String,
    pub due_date: Option<DateTime<Utc>>,
    #[serde(default)]
    pub priority: i16,
    pub recurrence: Option<String>,
    pub reminder_at: Option<DateTime<Utc>>,
}

/// Barcha maydonlar ixtiyoriy — faqat berilganlari yangilanadi.
/// `Option<Option<T>>`: tashqi None = tegmaslik, ichki None = NULL qilib qo'yish.
#[derive(Debug, Deserialize, Default)]
pub struct UpdateTask {
    pub title: Option<String>,
    pub notes: Option<String>,
    pub completed: Option<bool>,
    #[serde(default, deserialize_with = "double_option")]
    pub project_id: Option<Option<Uuid>>,
    #[serde(default, deserialize_with = "double_option")]
    pub due_date: Option<Option<DateTime<Utc>>>,
    pub priority: Option<i16>,
    #[serde(default, deserialize_with = "double_option")]
    pub recurrence: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub reminder_at: Option<Option<DateTime<Utc>>>,
    pub position: Option<f64>,
}

/// JSON'da maydon berilgan-berilmaganini `null`dan ajratish uchun.
fn double_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Deserialize::deserialize(deserializer).map(Some)
}

#[derive(Debug, Deserialize)]
pub struct TaskQuery {
    pub project_id: Option<Uuid>,
    pub completed: Option<bool>,
    /// "today" | "upcoming" | "overdue"
    pub view: Option<String>,
}
