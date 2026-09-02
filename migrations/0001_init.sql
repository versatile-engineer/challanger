-- Loyihalar / ro'yxatlar
CREATE TABLE projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#4f46e5',
    position    DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vazifalar
CREATE TABLE tasks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
    title        TEXT NOT NULL,
    notes        TEXT NOT NULL DEFAULT '',
    completed    BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    due_date     TIMESTAMPTZ,
    -- 0 = yo'q, 1 = past, 2 = o'rta, 3 = yuqori
    priority     SMALLINT NOT NULL DEFAULT 0,
    -- Oddiy takrorlanish qoidasi: NULL | 'daily' | 'weekly' | 'monthly' | 'yearly'
    recurrence   TEXT,
    reminder_at  TIMESTAMPTZ,
    position     DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_due     ON tasks(due_date);
CREATE INDEX idx_tasks_completed ON tasks(completed);

-- Teglar
CREATE TABLE tags (
    id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name  TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#64748b'
);

CREATE TABLE task_tags (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id  UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
);
