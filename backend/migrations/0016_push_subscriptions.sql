-- Web Push obunalari — brauzer push bildirishnomalari uchun.
-- Har bir foydalanuvchi bir nechta qurilma/brauzerdan obuna bo'lishi mumkin.
CREATE TABLE push_subscriptions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, endpoint)
);
CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);
