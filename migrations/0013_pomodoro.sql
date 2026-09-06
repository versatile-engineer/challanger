-- Pomodoro sessiyalari — tugatilgan taymerlar (statistika uchun).
CREATE TABLE pomodoro_sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,                 -- 'work' | 'short' | 'long'
    seconds    INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pomodoro_user_created ON pomodoro_sessions(user_id, created_at);
