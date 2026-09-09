-- Username kelajakdagi groupwork uchun noyob (unique) bo'lishi kerak.
-- Mavjud username'larni kichik harfga keltiramiz (ehtiyot chorasi).
UPDATE users SET username = lower(username);

-- Noyob indeks (nom "username" so'zini o'z ichiga oladi — xato xabarini ajratish uchun)
CREATE UNIQUE INDEX users_username_key ON users (username);
