#!/bin/sh

# Lifecycle:
#   - Starts Next.js standalone server (next-service-dist/server.js)
#   - Starts all mini-services (mini-services-dist/mini-service-*.js)
#   - Runs Caddy as the foreground process (PID 1) for TLS termination.
#
# Hardening:
#   - Refuses to start Next.js without a real Postgres DATABASE_URL. The
#     previous version defaulted to a packaged SQLite file, but the Prisma
#     schema mandates `provider = "postgresql"` — the first query would
#     throw `PrismaClientInitializationError: Unknown datasource provider`,
#     taking down every API route. Failing fast is safer than failing
#     per-request.
#   - All child processes are tracked and torn down on SIGTERM/SIGINT with
#     a 5s grace window before SIGKILL.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR"

pids=""
cleanup() {
    echo ""
    echo "🛑 Shutting down all services..."

    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            service_name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
            echo "   Stopping $pid ($service_name)..."
            kill -TERM "$pid" 2>/dev/null
        fi
    done

    sleep 1
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            timeout=4
            while [ $timeout -gt 0 ] && kill -0 "$pid" 2>/dev/null; do
                sleep 1
                timeout=$((timeout - 1))
            done
            if kill -0 "$pid" 2>/dev/null; then
                echo "   Force killing $pid..."
                kill -KILL "$pid" 2>/dev/null
            fi
        fi
    done

    echo "✅ All services stopped"
    exit 0
}

trap cleanup TERM INT

echo "🚀 Starting all services..."
echo ""
cd "$BUILD_DIR" || exit 1

ls -lah

# ---------- Python runtime (only if packaged) ----------
if [ -d "/app/python-runtime/site-packages" ]; then
    export PYTHONPATH="/app/python-runtime/site-packages:/app/next-service-dist${PYTHONPATH:+:$PYTHONPATH}"
    export PATH="/app/python-runtime/site-packages/bin:$PATH"
    export PYTHONDONTWRITEBYTECODE=1
    export PYTHONUNBUFFERED=1
    echo "🐍 Python runtime enabled: $(python --version 2>&1)"
fi

# ---------- Next.js server ----------
if [ -f "./next-service-dist/server.js" ]; then
    echo "🚀 Starting Next.js server..."
    cd next-service-dist/ || exit 1

    export NODE_ENV=production
    export PORT="${PORT:-3000}"
    export HOSTNAME="${HOSTNAME:-0.0.0.0}"

    # Prisma schema mandates provider=postgresql. Refuse to start without
    # a real Postgres DATABASE_URL — the previous SQLite default caused
    # `PrismaClientInitializationError` on the first query of every request.
    case "${DATABASE_URL:-}" in
        ""|file:*)
            echo "❌ DATABASE_URL is missing or points to a SQLite file."
            echo "   prisma/schema.prisma uses provider=\"postgresql\" —"
            echo "   set DATABASE_URL to a postgres:// connection string."
            exit 1
            ;;
    esac

    # Same for DIRECT_URL (used by prisma migrate at deploy time, but
    # included here for completeness so operators see one clear error).
    case "${DIRECT_URL:-${DATABASE_URL}}" in
        file:*)
            echo "❌ DIRECT_URL points to a SQLite file — Postgres is required."
            exit 1
            ;;
    esac

    echo "🗄️  DATABASE_URL: $(echo "$DATABASE_URL" | sed 's#://[^@]*@#://***:***@#')"

    # Raise the heap ceiling so a standalone Next + Prisma process does
    # not OOM during traffic spikes. 2048m matches the dev/build setting.
    export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=2048"

    # Background Next.js. Do NOT pipe through `tee` — that introduces a
    # SIGPIPE failure mode where the Next process dies if the consumer
    # exits. Logs go to stdout/stderr directly.
    bun server.js &
    NEXT_PID=$!
    pids="$NEXT_PID"

    sleep 1
    if ! kill -0 "$NEXT_PID" 2>/dev/null; then
        echo "❌ Next.js server failed to start"
        exit 1
    fi
    echo "✅ Next.js started (PID: $NEXT_PID, Port: $PORT)"

    cd ../
else
    echo "⚠️  ./next-service-dist/server.js not found — skipping Next.js"
fi

# ---------- mini-services ----------
if [ -f "./mini-services-start.sh" ]; then
    echo "🚀 Starting mini-services..."
    sh ./mini-services-start.sh &
    MINI_PID=$!
    pids="$pids $MINI_PID"

    sleep 1
    if ! kill -0 "$MINI_PID" 2>/dev/null; then
        echo "⚠️  mini-services may have failed to start — continuing"
    else
        echo "✅ mini-services started (PID: $MINI_PID)"
    fi
elif [ -d "./mini-services-dist" ]; then
    echo "⚠️  mini-services-start.sh missing but directory exists"
else
    echo "ℹ️  No mini-services directory — skipping"
fi

# ---------- Caddy (foreground / PID 1) ----------
if command -v caddy >/dev/null 2>&1 && [ -f "../Caddyfile" ]; then
    echo "🚀 Starting Caddy (foreground)..."
    echo ""
    echo "🎉 All services started"
    echo "💡 Press Ctrl+C to stop"
    echo ""
    exec caddy run --config ../Caddyfile --adapter caddyfile
elif command -v caddy >/dev/null 2>&1 && [ -f "./Caddyfile" ]; then
    echo "🚀 Starting Caddy (foreground)..."
    echo ""
    echo "🎉 All services started"
    echo "💡 Press Ctrl+C to stop"
    echo ""
    exec caddy run --config ./Caddyfile --adapter caddyfile
else
    echo ""
    echo "🎉 All services started (no Caddy — keeping foreground alive)"
    echo "💡 Press Ctrl+C to stop"
    echo ""
    # No Caddy: keep the script alive so the trap can fire on signals.
    wait
fi
