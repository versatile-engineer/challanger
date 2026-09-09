-- Jamoalar (guruhlar)
CREATE TABLE groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invite_code TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guruh a'zolari
CREATE TABLE group_members (
    group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role      TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

-- Jamoaviy odatlar (barcha a'zolar birga bajaradi)
CREATE TABLE group_habits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    color           TEXT NOT NULL DEFAULT '#10b981',
    frequency       TEXT NOT NULL DEFAULT 'daily',
    target_per_week SMALLINT NOT NULL DEFAULT 7,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_group_habits_group ON group_habits(group_id);

-- Har bir a'zoning jamoaviy odatni bajargan kunlari
CREATE TABLE group_habit_entries (
    group_habit_id UUID NOT NULL REFERENCES group_habits(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day            DATE NOT NULL,
    PRIMARY KEY (group_habit_id, user_id, day)
);
