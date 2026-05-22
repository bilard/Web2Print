# ─── Stage 1 : build TypeScript ────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ─── Stage 2 : runtime (Chromium + ffmpeg + Node 22) ──────────────────
FROM node:22-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=production \
    PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ffmpeg \
      ca-certificates \
      fonts-liberation \
      fonts-noto-color-emoji \
      libnss3 \
      libxss1 \
      libasound2 \
      libatk-bridge2.0-0 \
      libgtk-3-0 \
      libgbm1 \
      libxshmfence1 \
      libdrm2 \
      libxkbcommon0 \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    HYPERFRAMES_CHROME_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY templates ./templates

EXPOSE 8080
CMD ["node", "dist/server.js"]
