#!/bin/bash
# scripts/stop-dev.sh — stop the dev server
cd "$(dirname "$0")/.."
if [ -f .dev.pid ]; then
  PID=$(cat .dev.pid)
  if kill -0 "$PID" 2>/dev/null; then
    echo "Stopping dev server (PID $PID)..."
    kill "$PID" 2>/dev/null || true
    sleep 2
    # Kill the whole process group
    kill -9 "-$PID" 2>/dev/null || true
  fi
  rm -f .dev.pid
fi
pkill -f "next dev -p 3000" 2>/dev/null || true
echo "Dev server stopped"
