# Challanger — shaxsiy TickTick alternativasi

Rust (Axum + PostgreSQL) backend va React (Vite + TypeScript) frontend'da qurilgan
vazifa boshqaruvchi.

## Imkoniyatlar

- 🔐 Autentifikatsiya — ro'yxatdan o'tish (username + email + parol) va kirish (email + parol), JWT tokenlar
- ✅ Vazifalar CRUD — sarlavha, izoh, muddat (due), prioritet (0–3), holat
- 📁 Loyihalar / ro'yxatlar va teglar
- 🔁 Takrorlanuvchi vazifalar (har kuni / hafta / oy / yil) — "bajarilganda" avtomatik keyingi muddatga suriladi
- ⏰ Eslatmalar — brauzer bildirishnomalari **va Telegram bot** orqali
- 🤖 **Telegram bot** — hisobni ulab, vazifa eslatmalarini Telegram'da xabar sifatida olish (`/today`, `/help` buyruqlari)
- 📅 Aqlli ko'rinishlar: **Bugun**, **Kelgusi**, **Barchasi**
- 📆 **Kalendar** — vazifalar oylik gridda, kunga bosib vazifa qo'shish
- 🧭 **Eisenhower matritsasi** — 4 kvadrant, drag-and-drop bilan
- 🔥 **Odatlar (habit tracker)** — chastota (har kuni / haftada N marta) va davomiylik (kun soni / sanagacha / doimiy) tanlanadi; kunlik belgilash, streak, progress %
- 🧩 **Kichik qadamlar (subtasklar)** — har vazifa ichida checklist va progress
- 👥 **Jamoa (groupwork)** — guruh yaratish/qo'shilish, jamoaviy odat va vazifalar, reaksiyalar, leaderboard
- 📊 **Statistika** — vazifa/odat grafiklari (donut, bar, ustunlar)
- 🍅 **Pomodoro** — 25/5 taymer, avtomatik tanaffuslar
- ⏳ **Countdown** — muhim sanalargacha sanoq (localStorage)
- ⌨️ **Buyruqlar paneli (Ctrl+K)** — tez navigatsiya va amallar
- ⚙️ **Sozlamalar** — profil (username/email), parol o'zgartirish, mavzu (tizim / yorug' / qorong'i / **gruvbox**), Telegram ulash, zaxira (eksport/import), hisobni o'chirish

## Texnologiyalar

| Qatlam    | Texnologiya |
|-----------|-------------|
| Backend   | Rust, Axum, SQLx, Tokio, reqwest (Telegram) |
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

## Docker bilan deploy (prod)

Butun stek (PostgreSQL + backend + frontend) bitta `docker compose` bilan ko'tariladi.
Frontend qurilgach, backend uni bir xil manzildan (`/`) beradi — alohida nginx kerak emas.

```bash
cp .env.docker.example .env      # JWT_SECRET va (ixtiyoriy) TELEGRAM_BOT_TOKEN ni to'ldiring
docker compose up -d --build
```

- Ilova: http://localhost:3000
- Migratsiyalar konteyner ishga tushganda avtomatik qo'llanadi.
- Ma'lumotlar `pgdata` docker volume'ida saqlanadi (qayta ishga tushirishda yo'qolmaydi).

Ishlab chiqarishda:
- `JWT_SECRET` ni albatta o'zgartiring: `openssl rand -hex 32`
- Reverse-proxy (nginx/Caddy) orqali HTTPS qo'shing — `app` konteyner 3000-portda turadi.

Fayllar: `Dockerfile` (3 bosqichli: frontend → backend → runtime), `docker-compose.yml`, `.dockerignore`.

## Telegram bot (ixtiyoriy)

Bot vazifa eslatmalarini Telegram'ga xabar sifatida yuboradi. Sozlash uch qadam:

1. **Bot yarating** — Telegram'da [@BotFather](https://t.me/BotFather) → `/newbot` → tokenni oling.
2. **`.env` ga qo'shing**:
   ```bash
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   ```
3. **Backendni qayta ishga tushiring** — logda `🤖 Telegram bot yoqildi: @sizning_bot` chiqadi.

So'ng ilovada **Sozlamalar → Telegram eslatmalari → "Telegram'ni ulash"** → bot ochiladi → **Start** → **⟳ Tekshirish**.

Ishlash tamoyili:
- **Long polling** (`getUpdates`) — public HTTPS URL kerak emas, self-hosted serverda ham ishlaydi.
- Fon vazifasi har 30 soniyada `reminder_at` yetgan, bajarilmagan vazifalarni topib xabar yuboradi (takror yubormaydi).
- Token berilmasa bot jim o'chiq turadi — ilova avvalgidek ishlaydi.

Bot buyruqlari: `/start <kod>` (ulash), `/today` (bugungi vazifalar), `/help`.

## API

Barcha yo'llar `/api` ostida. Vazifa/loyiha yo'llari `Authorization: Bearer <token>` talab qiladi:

| Metod  | Yo'l                     | Tavsif |
|--------|--------------------------|--------|
| POST   | `/auth/signup`           | Ro'yxatdan o'tish (`username`, `email`, `password`) → token |
| POST   | `/auth/login`            | Kirish (`email`, `password`) → token |
| GET    | `/auth/me`               | Joriy foydalanuvchi (token bilan) |
| PATCH  | `/auth/me`               | Profilni yangilash (`username`, `email`) |
| DELETE | `/auth/me`               | Hisobni o'chirish (kaskad: vazifa/loyiha/odat) |
| POST   | `/auth/password`         | Parol o'zgartirish (`current_password`, `new_password`) |
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
| GET    | `/telegram/status`       | Bot sozlanganmi (`configured`) va hisob ulanganmi (`connected`) |
| POST   | `/telegram/link`         | Bir martalik bog'lash kodi + deep-link qaytaradi |
| POST   | `/telegram/unlink`       | Hisobni Telegram'dan uzadi |

> Eslatma: subtask (`/tasks/:id/subtasks`, `/subtasks/:id`) va jamoa (`/groups*`) yo'llari ham mavjud — kod: `src/routes/`.

## Keyingi qadamlar (g'oyalar)

- Vazifalarni drag-and-drop bilan tartiblash
- Pomodoro sessiyalarini serverga yozish (statistika)
- Telegram botga inline tugmalar (vazifani to'g'ridan-to'g'ri bajarish) va kunlik ertalabki xulosa
