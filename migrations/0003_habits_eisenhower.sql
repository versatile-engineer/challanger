-- Eisenhower matritsasi uchun kvadrant (1..4), NULL = tayinlanmagan
ALTER TABLE tasks ADD COLUMN eisenhower SMALLINT;

-- Odatlar (habit tracker)
CREATE TABLE habits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    color           TEXT NOT NULL DEFAULT '#10b981',
    target_per_week SMALLINT NOT NULL DEFAULT 7,
    position        DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_habits_user ON habits(user_id);

-- Odat bajarilgan kunlar (qatorning mavjudligi = o'sha kuni bajarilgan)
CREATE TABLE habit_entries (
    habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    day      DATE NOT NULL,
    PRIMARY KEY (habit_id, day)
);
