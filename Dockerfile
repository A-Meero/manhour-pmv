# Manhour system - production image
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# Placeholder only so Prisma/Next can build; the real value comes from .env.docker at runtime
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    NEXT_TELEMETRY_DISABLED=1

# npm ci runs "prisma generate" (postinstall), so the schema must be there first
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tzdata && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Kuwait \
    PORT=3002 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/app/uploads \
    TESSDATA_DIR=/app/tessdata

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts /app/next.config.ts /app/tsconfig.json ./
# Offline OCR language file (so Tesseract never downloads it)
COPY --from=build /app/eng.traineddata ./tessdata/eng.traineddata

EXPOSE 3002
# Apply any new database migrations, then start (same as the previous Dockerfile)
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p 3002 -H 0.0.0.0"]
