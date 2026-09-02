# Challanger — buyruqlar ro'yxati. Yordamchi uchun: `just`

# Standart: mavjud buyruqlarni ko'rsatadi
default:
    @just --list

# 🚀 Hammasini ishga tushirish: baza + backend + frontend
dev:
    scripts/dev.sh

# 📦 Frontend paketlarini o'rnatish (bir marta)
setup:
    cd frontend && pnpm install

# ▶️  Faqat backend (http://127.0.0.1:3000)
back:
    scripts/pg.sh start
    cargo run

# ▶️  Faqat frontend (http://localhost:5173)
front:
    cd frontend && pnpm dev

# --- Ma'lumotlar bazasi ---

# Bazani birinchi marta yaratish
db-init:
    scripts/pg.sh init

# Bazani ishga tushirish
db-start:
    scripts/pg.sh start

# Bazani to'xtatish
db-stop:
    scripts/pg.sh stop

# SQL konsoli
db-psql:
    scripts/pg.sh psql

# Bazani o'chirib qayta yaratish (⚠️ barcha ma'lumot o'chadi)
db-reset:
    scripts/pg.sh reset

# --- Qurish va tekshirish ---

# Butun loyihani qurish (backend + frontend)
build:
    cargo build
    cd frontend && pnpm build

# Rust: format + clippy + test
check:
    cargo fmt --check
    cargo clippy -- -D warnings
    cargo test

# Kodni formatlash
fmt:
    cargo fmt
    cd frontend && pnpm exec tsc -b

# Qurilma fayllarini tozalash
clean:
    cargo clean
    rm -rf frontend/dist frontend/node_modules/.vite
