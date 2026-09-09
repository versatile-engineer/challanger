-- Guruh funksiyalarini kengaytirish: profil, rollar, vazifa mas'uli/muddati,
-- chat, challenge (musobaqa).

-- 1) Guruh profili (emoji + tavsif)
ALTER TABLE groups ADD COLUMN emoji       TEXT NOT NULL DEFAULT '👥';
ALTER TABLE groups ADD COLUMN description TEXT NOT NULL DEFAULT '';

-- 2) Umumiy vazifalarga mas'ul, muddat va eslatma
ALTER TABLE group_tasks ADD COLUMN assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE group_tasks ADD COLUMN due_date      TIMESTAMPTZ;
ALTER TABLE group_tasks ADD COLUMN reminder_at   TIMESTAMPTZ;
ALTER TABLE group_tasks ADD COLUMN reminder_sent BOOLEAN NOT NULL DEFAULT false;

-- 3) Guruh chati (a'zolar yozadigan xabarlar)
CREATE TABLE group_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    text       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_group_messages_group ON group_messages(group_id, created_at DESC);

-- 4) Challenge (vaqt chegarali jamoaviy musobaqa)
CREATE TABLE group_challenges (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date   DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_group_challenges_group ON group_challenges(group_id);
