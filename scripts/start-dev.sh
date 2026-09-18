#!/bin/bash
# scripts/start-dev.sh — durable dev server starter
#
# Starts the Next.js dev server in a fully detached process group that
# survives parent shell termination. Writes the PID to .dev.pid for
# later management.
#
# CRITICAL: Unsets DATABASE_URL and DIRECT_URL from the shell environment
# before starting the dev server. The shell env may contain a stale
# SQLite URL from the original setup that overrides the .env file's
# Supabase Postgres URL, causing Prisma to fail with:
#   "the URL must start with the protocol postgresql:// or postgres://"
# This makes Next.js read the correct values from .env.
#
# Usage:
#   bash scripts/start-dev.sh          # start
#   bash scripts/stop-dev.sh          # stop

set -e
cd "$(dirname "$0")/.."

# Kill any existing dev server
if [ -f .dev.pid ]; then
  OLD_PID=$(cat .dev.pid)
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Killing existing dev server (PID $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 2
  fi
  rm -f .dev.pid
fi

# Also kill any orphaned next dev processes
pkill -f "next dev -p 3000" 2>/dev/null || true
sleep 1

# CRITICAL: Clear stale DATABASE_URL from shell env so Next.js reads .env
# The shell env may have DATABASE_URL=file:/.../custom.db from the old
# SQLite setup, which overrides .env and breaks Prisma.
unset DATABASE_URL
unset DIRECT_URL

echo "Starting Next.js dev server..."
echo "  DATABASE_URL (from .env): $(grep '^DATABASE_URL=' .env | head -1 | cut -c1-60)..."
echo "  DIRECT_URL    (from .env): $(grep '^DIRECT_URL=' .env | head -1 | cut -c1-60)..."

# Use setsid + nohup + disown for maximum detachment.
# The `env -i` would strip PATH too (breaks PostCSS/Turbopack), so we
# only unset the conflicting vars above.
setsid bash -c 'unset DATABASE_URL; unset DIRECT_URL; nohup bun run dev > /tmp/lifedb-dev.log 2>&1 < /dev/null' &
DEV_PID=$!
disown
echo "$DEV_PID" > .dev.pid
echo "Dev server started (PID $DEV_PID)"
echo "Log: /tmp/lifedb-dev.log"
echo "Waiting for server to be ready..."

# Wait for the server to be ready (max 30 seconds)
for i in $(seq 1 30); do
  if curl -sS -o /dev/null http://localhost:3000/api/auth/providers 2>/dev/null; then
    echo "Server is ready! (took ${i}s)"
    echo "URL: http://localhost:3000"
    exit 0
  fi
  sleep 1
done

echo "ERROR: Server did not become ready within 30 seconds"
echo "--- Last 20 lines of log ---"
tail -20 /tmp/lifedb-dev.log
exit 1
