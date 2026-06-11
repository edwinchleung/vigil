#!/bin/sh
set -e

if [ "${WAIT_FOR_DB}" = "true" ]; then
  echo "Waiting for database at ${DB_HOST:-postgres}:${DB_PORT:-5432}..."
  until pg_isready -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USER:-vigil}" -d "${DB_NAME:-vigil}"; do
    sleep 1
  done
fi

if [ "${APPLY_PG_STUB}" = "true" ]; then
  echo "Applying Postgres stub for Prisma migrations..."
  prisma db execute --file scripts/ci-postgres-stub-for-prisma.sql --schema prisma/schema.prisma
fi

if [ "${RUN_MIGRATIONS}" != "false" ]; then
  echo "Running Prisma migrations..."
  prisma migrate deploy --schema prisma/schema.prisma
fi

echo "Starting Next.js..."
exec node server.js
