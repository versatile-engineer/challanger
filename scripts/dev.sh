#!/usr/bin/env bash
# Backend + frontendni birga ishga tushiradi (nix devShell ichida).
# Foydalanish: scripts/dev.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Bazani ishga tushirish (agar init qilinmagan bo'lsa — init qiladi)
if [ ! -d "${PGDATA:-./.pg/data}" ]; then
  scripts/pg.sh init
else
  scripts/pg.sh start || true
fi

cleanup() {
  echo; echo "To'xtatilmoqda…"
  kill "${BACK_PID:-}" "${FRONT_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "▶️  Backend (http://127.0.0.1:3000)…"
cargo run &
BACK_PID=$!

echo "▶️  Frontend (http://localhost:5173)…"
( cd frontend && pnpm dev ) &
FRONT_PID=$!

wait
