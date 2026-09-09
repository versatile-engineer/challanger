-- Telegram integratsiyasi: hisobni ulash va eslatma yuborish uchun

-- Foydalanuvchining Telegram chat ID'si (ulanган bo'lsa) va bir martalik bog'lash kodi
ALTER TABLE users
    ADD COLUMN telegram_chat_id      BIGINT,
    ADD COLUMN telegram_link_code    TEXT,
    ADD COLUMN telegram_link_expires TIMESTAMPTZ;

-- Bir chat faqat bitta foydalanuvchiga bog'lanadi
CREATE UNIQUE INDEX idx_users_telegram_chat
    ON users(telegram_chat_id)
    WHERE telegram_chat_id IS NOT NULL;

-- Bog'lash kodi ham noyob (kod bo'yicha tez izlash uchun)
CREATE UNIQUE INDEX idx_users_telegram_code
    ON users(telegram_link_code)
    WHERE telegram_link_code IS NOT NULL;

-- Eslatma allaqachon yuborilganini belgilash (takror yubormaslik uchun)
ALTER TABLE tasks
    ADD COLUMN reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;

-- Eslatma yuboruvchi fon vazifasi tez topishi uchun indeks
CREATE INDEX idx_tasks_reminder
    ON tasks(reminder_at)
    WHERE reminder_at IS NOT NULL AND reminder_sent = FALSE AND completed = FALSE;
