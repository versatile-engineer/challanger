# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────
# 1-bosqich: Frontend (Vite) — statik `dist` yasaydi
# ─────────────────────────────────────────────
FROM node:22-slim AS frontend
WORKDIR /app/frontend

# pnpm'ni corepack orqali yoqamiz (lockfile bilan mos versiyani qadaymiz)
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

# Avval faqat manifestlarni ko'chirib, paketlarni keshlaymiz
COPY frontend/package.json frontend/pnpm-lock.yaml ./
# pnpm 10+ postinstall skriptlarni bloklaydi; esbuild binari optional-dep orqali
# keladi, lekin ignored-builds xatosi buildни to'xtatmasin uchun ruxsat beramiz
RUN pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true

# Endi manba kodini qurishimiz
COPY frontend/ ./
RUN pnpm build   # -> /app/frontend/dist

# ─────────────────────────────────────────────
# 2-bosqich: Backend (Rust) — release binar yasaydi
# ─────────────────────────────────────────────
FROM rust:1-bookworm AS backend
WORKDIR /app

# Bog'liqliklarni keshlash: avval faqat manifest, so'ng bo'sh main bilan qurish
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs \
    && cargo build --release \
    && rm -rf src

# Haqiqiy manba kodi va migratsiyalar
# (migratsiyalar `sqlx::migrate!` orqali binarga compile vaqtida joylanadi)
COPY src ./src
COPY migrations ./migrations
# main.rs vaqtini yangilaymiz, aks holda cargo qayta qurmaydi
RUN touch src/main.rs && cargo build --release

# ─────────────────────────────────────────────
# 3-bosqich: Runtime — kichik debian, faqat binar + dist
# ─────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime
WORKDIR /app

# TLS (Telegram API) uchun sertifikatlar
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Root emas, oddiy foydalanuvchi bilan ishlaymiz
RUN useradd --system --uid 10001 challanger

COPY --from=backend /app/target/release/challanger /usr/local/bin/challanger
COPY --from=frontend /app/frontend/dist ./frontend/dist

ENV BIND_ADDR=0.0.0.0:3000
ENV FRONTEND_DIR=/app/frontend/dist
ENV RUST_LOG=challanger=info,tower_http=warn,info

USER challanger
EXPOSE 3000
CMD ["challanger"]
