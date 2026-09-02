# Challanger — shaxsiy TickTick alternativasi

Rust (Axum + PostgreSQL) backend va React (Vite + TypeScript) frontend'da qurilgan
vazifa boshqaruvchi.

## Imkoniyatlar

- 🔐 Autentifikatsiya — ro'yxatdan o'tish (username + email + parol) va kirish (email + parol), JWT tokenlar
- ✅ Vazifalar CRUD — sarlavha, izoh, muddat (due), prioritet (0–3), holat
- 📁 Loyihalar / ro'yxatlar va teglar
- 🔁 Takrorlanuvchi vazifalar (har kuni / hafta / oy / yil) — "bajarilganda" avtomatik keyingi muddatga suriladi
- ⏰ Eslatmalar (brauzer bildirishnomalari orqali)
- 📅 Aqlli ko'rinishlar: **Bugun**, **Kelgusi**, **Barchasi**
- 📆 **Kalendar** — vazifalar oylik gridda, kunga bosib vazifa qo'shish
- 🧭 **Eisenhower matritsasi** — 4 kvadrant, drag-and-drop bilan
- 🔥 **Odatlar (habit tracker)** — chastota (har kuni / haftada N marta) va davomiylik (kun soni / sanagacha / doimiy) tanlanadi; kunlik belgilash, streak, progress %
- 🍅 **Pomodoro** — 25/5 taymer, avtomatik tanaffuslar
- ⏳ **Countdown** — muhim sanalargacha sanoq (localStorage)

## Texnologiyalar

| Qatlam    | Texnologiya |
|-----------|-------------|
| Backend   | Rust, Axum, SQLx, Tokio |
| Baza      | PostgreSQL 16 (loyiha ichida, docker kerak emas) |
| Frontend  | React 18, Vite, TypeScript |
| Muhit     | Nix flake + direnv |

## Boshlash

Muhit `direnv` orqali avtomatik yuklanadi (`.envrc` → `use flake`). Birinchi marta:

```bash
direnv allow          # yoki: nix develop
```

Bu Rust toolchain, Node, pnpm va PostgreSQL'ni beradi.

### Frontend paketlari

```bash
cd frontend && pnpm install && cd ..
```

### Hammasini birga ishga tushirish

```bash
scripts/dev.sh
```

- Backend: http://127.0.0.1:3000
- Frontend: http://localhost:5173  ← **shu yerdan foydalaning**

### Alohida ishga tushirish

```bash
scripts/pg.sh init      # bazani birinchi marta yaratish (keyin: start/stop/psql/reset)
cargo run               # backend
cd frontend && pnpm dev # frontend
```

## Ma'lumotlar bazasi

Mahalliy PostgreSQL loyiha ichidagi `.pg/` papkasida saqlanadi (git'ga kirmaydi).

```bash
scripts/pg.sh init      # yaratish
scripts/pg.sh start     # ishga tushirish
scripts/pg.sh stop      # to'xtatish
scripts/pg.sh psql      # SQL konsoli
scripts/pg.sh reset     # o'chirib qayta yaratish
```

Migratsiyalar backend ishga tushganda avtomatik qo'llanadi (`migrations/`).

## API

Barcha yo'llar `/api` ostida. Vazifa/loyiha yo'llari `Authorization: Bearer <token>` talab qiladi:

| Metod  | Yo'l                     | Tavsif |
|--------|--------------------------|--------|
| POST   | `/auth/signup`           | Ro'yxatdan o'tish (`username`, `email`, `password`) → token |
| POST   | `/auth/login`            | Kirish (`email`, `password`) → token |
| GET    | `/auth/me`               | Joriy foydalanuvchi (token bilan) |
| GET    | `/projects`              | Loyihalar ro'yxati |
| POST   | `/projects`              | Loyiha yaratish |
| PATCH  | `/projects/:id`          | Tahrirlash |
| DELETE | `/projects/:id`          | O'chirish |
| GET    | `/tasks?view=today`      | Vazifalar (filtrlar: `project_id`, `completed`, `view`) |
| POST   | `/tasks`                 | Vazifa yaratish |
| PATCH  | `/tasks/:id`             | Tahrirlash |
| POST   | `/tasks/:id/complete`    | Bajarilgan (takrorlanuvchi bo'lsa — surish) |
| DELETE | `/tasks/:id`             | O'chirish |
| GET    | `/habits`                | Odatlar + oxirgi 90 kunlik bajarilgan kunlar |
| POST   | `/habits`                | Odat yaratish (`frequency`, `target_per_week`, `duration_days` yoki `end_date`) |
| PATCH  | `/habits/:id`            | Tahrirlash |
| DELETE | `/habits/:id`            | O'chirish |
| POST   | `/habits/:id/toggle`     | Kun belgisini almashtirish (`{ "day": "YYYY-MM-DD" }`) |

## Keyingi qadamlar (g'oyalar)

- Subtasklar (checklist)
- Vazifalarni drag-and-drop bilan tartiblash
- Pomodoro sessiyalarini serverga yozish (statistika)
- Ko'p qurilma sinxronizatsiyasi (auth allaqachon bor)
- Server tomonda eslatma push (masalan, web-push yoki Telegram bot)
