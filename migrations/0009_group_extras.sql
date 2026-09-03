-- Guruh umumiy vazifalari (birgalikda bajariladigan to-do)
CREATE TABLE group_tasks (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    done       BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    done_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_group_tasks_group ON group_tasks(group_id);

-- Jamoaviy odatga reaksiyalar (emoji)
CREATE TABLE group_habit_reactions (
    group_habit_id UUID NOT NULL REFERENCES group_habits(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji          TEXT NOT NULL,
    PRIMARY KEY (group_habit_id, user_id, emoji)
);

-- Guruh faoliyat tarixi (bildirishnoma tasmasi)
CREATE TABLE group_activity (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_group_activity_group ON group_activity(group_id, created_at DESC);
