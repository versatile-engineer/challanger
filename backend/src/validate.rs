//! Kirish qiymatlarini tekshirish uchun umumiy yordamchilar.
//! Barcha route'lar shu yerdagi chegaralar va formatlardan foydalanadi.

use chrono::{NaiveDate, Utc};

use crate::error::{AppError, AppResult};

pub const MAX_NAME: usize = 100;
pub const MAX_TITLE: usize = 500;
pub const MAX_NOTES: usize = 10_000;
pub const MAX_PASSWORD: usize = 128;

const RECURRENCES: [&str; 6] = [
    "daily", "weekdays", "weekly", "biweekly", "monthly", "yearly",
];

/// Trimlab, bo'sh emasligini va uzunlik chegarasini tekshiradi.
pub fn required_text(field: &str, s: &str, max: usize) -> AppResult<String> {
    let t = s.trim();
    if t.is_empty() {
        return Err(AppError::BadRequest(format!(
            "{field} bo'sh bo'lishi mumkin emas"
        )));
    }
    if t.chars().count() > max {
        return Err(AppError::BadRequest(format!(
            "{field} juda uzun (maksimum {max} belgi)"
        )));
    }
    Ok(t.to_string())
}

/// Ixtiyoriy matn — trimlaydi va faqat uzunlikni tekshiradi.
pub fn optional_text(field: &str, s: &str, max: usize) -> AppResult<String> {
    let t = s.trim();
    if t.chars().count() > max {
        return Err(AppError::BadRequest(format!(
            "{field} juda uzun (maksimum {max} belgi)"
        )));
    }
    Ok(t.to_string())
}

/// Parol uzunligi: 6..=128 (juda uzun parol Argon2 uchun DoS bo'lishi mumkin).
pub fn password(p: &str) -> AppResult<()> {
    if p.len() < 6 {
        return Err(AppError::BadRequest(
            "parol kamida 6 ta belgidan iborat bo'lsin".into(),
        ));
    }
    if p.len() > MAX_PASSWORD {
        return Err(AppError::BadRequest(format!(
            "parol juda uzun (maksimum {MAX_PASSWORD} belgi)"
        )));
    }
    Ok(())
}

/// Takrorlanish qiymatini ruxsat etilgan ro'yxat bilan tekshiradi.
pub fn recurrence(r: Option<String>) -> AppResult<Option<String>> {
    match r {
        None => Ok(None),
        Some(v) if RECURRENCES.contains(&v.as_str()) => Ok(Some(v)),
        Some(_) => Err(AppError::BadRequest(
            "noto'g'ri takrorlanish qiymati".into(),
        )),
    }
}

/// `#rgb` yoki `#rrggbb` formatidagi HEX rangni tekshiradi.
pub fn color(c: String) -> AppResult<String> {
    let ok = (c.len() == 4 || c.len() == 7)
        && c.starts_with('#')
        && c[1..].chars().all(|ch| ch.is_ascii_hexdigit());
    if ok {
        Ok(c)
    } else {
        Err(AppError::BadRequest(
            "noto'g'ri rang formati (#rrggbb)".into(),
        ))
    }
}

/// 'daily' yoki 'weekly' ga normallashtiradi (boshqa qiymatlar 'daily').
pub fn frequency(f: &str) -> &'static str {
    if f == "weekly" {
        "weekly"
    } else {
        "daily"
    }
}

/// Odat belgisi uchun ruxsat etilgan kun: bugundan ±1 kun
/// (vaqt mintaqasi chekkalarini hisobga olib; ommaviy backfill/kelajakni bloklaydi).
pub fn toggle_day(day: NaiveDate) -> AppResult<NaiveDate> {
    let today = Utc::now().date_naive();
    if (day - today).num_days().abs() <= 1 {
        Ok(day)
    } else {
        Err(AppError::BadRequest(
            "faqat bugungi kunni belgilash mumkin".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recurrence_validation() {
        assert!(recurrence(None).unwrap().is_none());
        assert_eq!(
            recurrence(Some("daily".into())).unwrap().as_deref(),
            Some("daily")
        );
        assert!(recurrence(Some("bogus".into())).is_err());
    }

    #[test]
    fn color_validation() {
        assert!(color("#10b981".into()).is_ok());
        assert!(color("#fff".into()).is_ok());
        assert!(color("10b981".into()).is_err());
        assert!(color("#zzzzzz".into()).is_err());
        assert!(color("#10b98".into()).is_err());
    }

    #[test]
    fn password_bounds() {
        assert!(password("12345").is_err());
        assert!(password("123456").is_ok());
        assert!(password(&"x".repeat(129)).is_err());
    }

    #[test]
    fn toggle_day_window() {
        let today = Utc::now().date_naive();
        assert!(toggle_day(today).is_ok());
        assert!(toggle_day(today + chrono::Duration::days(1)).is_ok());
        assert!(toggle_day(today - chrono::Duration::days(1)).is_ok());
        assert!(toggle_day(today + chrono::Duration::days(5)).is_err());
        assert!(toggle_day(today - chrono::Duration::days(5)).is_err());
    }
}
