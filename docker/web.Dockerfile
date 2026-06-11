# syntax=docker/dockerfile:1

FROM oven/bun:1.3.13 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.13 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Prisma generate + next build need plausible DB/auth env (not used at runtime).
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?sslmode=disable
ENV DIRECT_URL=postgresql://build:build@localhost:5432/build?sslmode=disable
ENV AUTH_SECRET=build-time-placeholder-must-be-32-chars-min
RUN bun run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g prisma@6

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts/ci-postgres-stub-for-prisma.sql ./scripts/ci-postgres-stub-for-prisma.sql
COPY docker/web-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
