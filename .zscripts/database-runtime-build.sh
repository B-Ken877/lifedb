#!/bin/bash

# Builds the database runtime into the deployment package.
#
# CRITICAL FIX: Prisma schema mandates `provider = "postgresql"`. The
# previous version of this script ran `DATABASE_URL="file:$TARGET_DB_PATH"
# bun run db:push`, which created a SQLite file in the package — but the
# Prisma client built from the schema is a Postgres-only client. The
# SQLite file was never usable by the runtime. Worse: when no
# DATABASE_URL was provided at runtime, `start.sh` defaulted to that
# file:// URL and every Prisma query threw
# `PrismaClientInitializationError: Unknown datasource provider: file:`.
#
# New behavior:
#   - Postgres is required. We refuse to package if DATABASE_URL is not
#     a postgres:// connection string.
#   - We run `prisma migrate deploy` against the configured Postgres so
#     the production schema is provisioned at build time.
#   - No SQLite file is copied into the package.

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/z/my-project}"
BUILD_DIR="${BUILD_DIR:?BUILD_DIR is required}"

cd "$PROJECT_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
    echo "❌ DATABASE_URL is not set."
    echo "   Prisma schema requires Postgres. Set DATABASE_URL to a"
    echo "   postgres:// connection string before building."
    exit 1
fi

case "$DATABASE_URL" in
    postgres://*|postgresql://*) ;;
    *)
        echo "❌ DATABASE_URL must be a Postgres connection (postgres:// or postgresql://)."
        echo "   Got: ${DATABASE_URL#*://*://}"
        exit 1
        ;;
esac

echo "🗄️  Postgres DATABASE_URL detected — applying migrations..."
# Use DIRECT_URL if provided (non-pooled, DDL-safe); fall back to DATABASE_URL.
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

# `migrate deploy` is the production-safe variant: it never prompts, never
# resets data, and only applies pending migrations from prisma/migrations.
if [ -d "prisma/migrations" ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
    bunx prisma migrate deploy
    echo "✅ Migrations applied"
else
    # No migration history yet — push the schema directly.
    echo "ℹ️  No migrations directory — running prisma db push"
    bunx prisma db push --accept-data-loss
fi

echo "✅ Database runtime build complete"
