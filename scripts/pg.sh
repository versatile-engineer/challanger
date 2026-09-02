#!/usr/bin/env bash
# Mahalliy PostgreSQL clusterni loyiha ichida boshqarish (docker kerak emas).
# Foydalanish: scripts/pg.sh {init|start|stop|status|psql|reset}
set -euo pipefail

cd "$(dirname "$0")/.."

PGDATA="${PGDATA:-./.pg/data}"
PGPORT="${PGPORT:-5433}"
PGSOCK="$(pwd)/.pg"
DB_USER="challanger"
DB_PASS="challanger"
DB_NAME="challanger"

init() {
  if [ -d "$PGDATA" ]; then
    echo "PGDATA allaqachon mavjud: $PGDATA"
    return
  fi
  mkdir -p "$PGDATA"
  # superuser sifatida joriy foydalanuvchi
  initdb -D "$PGDATA" -U postgres --auth=trust >/dev/null
  start
  # rol va bazani yaratish
  createuser -h "$PGSOCK" -p "$PGPORT" -U postgres "$DB_USER" 2>/dev/null || true
  psql -h "$PGSOCK" -p "$PGPORT" -U postgres -c \
    "ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';" >/dev/null
  createdb -h "$PGSOCK" -p "$PGPORT" -U postgres -O "$DB_USER" "$DB_NAME" 2>/dev/null || true
  echo "✅ Baza tayyor: postgres://$DB_USER:***@localhost:$PGPORT/$DB_NAME"
}

start() {
  if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    echo "PostgreSQL allaqachon ishlamoqda."
    return
  fi
  pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $PGSOCK -c listen_addresses=localhost" \
    -l "$PGSOCK/postgres.log" start
}

stop() {
  pg_ctl -D "$PGDATA" stop || true
}

status() {
  pg_ctl -D "$PGDATA" status || true
}

open_psql() {
  psql -h "$PGSOCK" -p "$PGPORT" -U "$DB_USER" "$DB_NAME"
}

reset() {
  stop || true
  rm -rf "$PGDATA" "$PGSOCK/postgres.log"
  init
}

case "${1:-}" in
  init) init ;;
  start) start ;;
  stop) stop ;;
  status) status ;;
  psql) open_psql ;;
  reset) reset ;;
  *) echo "Foydalanish: $0 {init|start|stop|status|psql|reset}"; exit 1 ;;
esac
