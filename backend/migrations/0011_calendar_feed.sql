-- Tashqi kalendarlarga (Google/Apple/Outlook) obuna uchun maxfiy feed tokeni.
-- NULL bo'lsa — foydalanuvchi hali feed'ni yoqmagan.
ALTER TABLE users ADD COLUMN calendar_token TEXT UNIQUE;
