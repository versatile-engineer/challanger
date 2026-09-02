-- Odatlar uchun chastota va davomiylik sozlamalari
ALTER TABLE habits
    -- 'daily' = har kuni, 'weekly' = haftada target_per_week marta
    ADD COLUMN frequency     TEXT NOT NULL DEFAULT 'daily',
    -- Boshlanish sanasi (progress shundan hisoblanadi)
    ADD COLUMN start_date    DATE NOT NULL DEFAULT now()::date,
    -- Davomiylik: kun soni (NULL = belgilanmagan)
    ADD COLUMN duration_days INTEGER,
    -- Yoki aniq tugash sanasi (NULL = belgilanmagan)
    ADD COLUMN end_date      DATE;
-- duration_days va end_date ikkalasi ham NULL bo'lsa — odat doimiy (cheksiz).
