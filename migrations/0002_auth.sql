-- Foydalanuvchilar
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auth qo'shilishidan oldingi egasiz test ma'lumotlarini tozalash
DELETE FROM tasks;
DELETE FROM projects;

-- Har bir loyiha va vazifa foydalanuvchiga tegishli
ALTER TABLE projects ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE tasks    ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_tasks_user    ON tasks(user_id);
