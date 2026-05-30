# syntax=docker/dockerfile:1.6

# ════════════════════════════════════════════════════════════
# Stage 1 — Build Vite app
# ════════════════════════════════════════════════════════════
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps dulu (layer caching: lebih cepat re-build kalau source berubah tapi deps sama)
COPY package*.json ./
RUN npm ci

# Vite "membakar" env vars VITE_* ke bundle saat BUILD time, bukan runtime.
# Cloud Run kirim nilainya via --build-arg dari "Build environment variables" config.
ARG VITE_NEON_DATABASE_URL
ARG VITE_GEMINI_API_KEY
ENV VITE_NEON_DATABASE_URL=${VITE_NEON_DATABASE_URL}
ENV VITE_GEMINI_API_KEY=${VITE_GEMINI_API_KEY}

# Copy source & build → output ke /app/dist
COPY . .
RUN npm run build

# ════════════════════════════════════════════════════════════
# Stage 2 — Serve static via nginx
# ════════════════════════════════════════════════════════════
FROM nginx:1.27-alpine

# Bersihkan default config nginx, pakai punya kita
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy hasil build dari stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

# Cloud Run expect container listen di $PORT (default 8080)
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
