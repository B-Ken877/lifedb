#!/bin/bash
# =====================================================
# LIFE DREAM BIG — process supervisor
#
# Wraps `bun run dev` (and the realtime mini-service) in an
# auto-restart loop. If Next.js crashes for ANY reason — OOM,
# uncaught exception, signal, Turbopack internal error — the
# supervisor restarts it within 1 second, up to 10 times
# within a 60-second window.
#
# Usage:
#   bash scripts/supervise.sh
#
# This is the recommended way to run the dev server. It replaces
#   bun run dev
# with a bulletproof wrapper that never stays down.
# =====================================================

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️${NC} $1"; }
err()  { echo -e "${RED}[$(date '+%H:%M:%S')] ❌${NC} $1"; }
big()  { echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"; }

# ---------- 0. Ensure .env exists ----------
if [ ! -f ".env" ]; then
    err ".env not found. Run 'bash scripts/setup.sh' first."
    exit 1
fi

# ---------- 1. Start the realtime mini-service (if not already running) ----------
start_realtime() {
    # Check if port 3003 is in use
    if curl -s --max-time 1 http://localhost:3003/health >/dev/null 2>&1; then
        log "Realtime service already running on port 3003"
        return 0
    fi

    log "Starting realtime mini-service..."
    cd "$PROJECT_DIR/mini-services/realtime-service"
    if [ ! -d "node_modules" ]; then
        bun install 2>&1 | tail -2
    fi
    # Start in background, fully detached
    setsid bun index.ts > "$PROJECT_DIR/.zscripts/mini-service-realtime.log" 2>&1 < /dev/null &
    disown
    cd "$PROJECT_DIR"

    # Wait for it to be ready
    for i in $(seq 1 10); do
        if curl -s --max-time 1 http://localhost:3003/health >/dev/null 2>&1; then
            log "Realtime service ready"
            return 0
        fi
        sleep 1
    done
    warn "Realtime service did not become ready in 10s — continuing anyway"
}

# ---------- 2. Supervisor loop for Next.js ----------
MAX_RESTARTS=10
WINDOW_SECONDS=60
RESTART_COUNT=0
WINDOW_START=$(date +%s)

cleanup() {
    big "Stopping supervisor..."
    if [ -n "${NEXT_PID:-}" ] && kill -0 "$NEXT_PID" 2>/dev/null; then
        kill -TERM "$NEXT_PID" 2>/dev/null || true
        sleep 2
        kill -KILL "$NEXT_PID" 2>/dev/null || true
    fi
    log "Stopped."
    exit 0
}
trap cleanup INT TERM

start_realtime

big "LIFE DREAM BIG — starting supervised Next.js dev server"
echo ""
log "Login URLs:"
log "  Agent: http://localhost:3000/connexion  (bken / wordpa\$\$123)"
log "  Admin: http://localhost:3000/connexion  (admin / ChangeMe!2025)"
echo ""
log "Press Ctrl+C to stop."
echo ""

# Supervisor loop
while true; do
    # Check if we've hit the restart limit within the window
    NOW=$(date +%s)
    ELAPSED=$((NOW - WINDOW_START))
    if [ $ELAPSED -gt $WINDOW_SECONDS ]; then
        # Reset the window
        RESTART_COUNT=0
        WINDOW_START=$NOW
    fi

    if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
        err "Next.js crashed $MAX_RESTARTS times within $WINDOW_SECONDS seconds."
        err "Giving up to avoid a crash loop. Check the logs:"
        err "  tail -100 /tmp/next-supervised.log"
        exit 1
    fi

    if [ $RESTART_COUNT -gt 0 ]; then
        warn "Restarting Next.js (attempt $RESTART_COUNT/$MAX_RESTARTS)..."
        sleep 1
    fi

    # Start Next.js in foreground (the supervisor blocks on this)
    # Pipe through cat (not tee) to avoid SIGPIPE — cat never exits
    log "Starting Next.js dev server (PID will be assigned)..."
    bun run dev 2>&1 | cat
    EXIT_CODE=${PIPESTATUS[0]}

    NOW=$(date +%s)
    if [ $((NOW - WINDOW_START)) -le $WINDOW_SECONDS ]; then
        RESTART_COUNT=$((RESTART_COUNT + 1))
    else
        RESTART_COUNT=1
        WINDOW_START=$NOW
    fi

    warn "Next.js exited with code $EXIT_CODE at $(date '+%H:%M:%S'). Auto-restarting... ($RESTART_COUNT/$MAX_RESTARTS in last $WINDOW_SECONDSs)"
done
