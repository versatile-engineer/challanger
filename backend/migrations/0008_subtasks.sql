-- Vazifa ichidagi kichik qadamlar (checklist)
CREATE TABLE subtasks (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    done       BOOLEAN NOT NULL DEFAULT false,
    position   DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subtasks_task ON subtasks(task_id);
