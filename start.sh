#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

BACKEND_PORT="${BACKEND_PORT:-4096}"
APP_PORT="${APP_PORT:-3000}"

# Source root .env so backend gets FIGMA_CLIENT_ID etc.
if [ -f "$ROOT/.env" ]; then
  set -a
  . "$ROOT/.env"
  set +a
fi

# Kill any existing process on the backend port
kill_existing() {
  local pid
  pid=$(lsof -ti :"$BACKEND_PORT" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "Killing existing process on port $BACKEND_PORT (PID $pid)..."
    kill $pid 2>/dev/null || true
    sleep 1
  fi
}

start_web() {
  kill_existing
  echo "Starting backend on port $BACKEND_PORT..."
  bun run --cwd packages/opencode --conditions=browser ./src/index.ts serve --port "$BACKEND_PORT" &
  BACKEND_PID=$!

  cleanup() {
    echo "Shutting down..."
    kill "$BACKEND_PID" 2>/dev/null || true
    exit 0
  }
  trap cleanup INT TERM

  echo "Backend started (PID $BACKEND_PID). Starting web app on port $APP_PORT..."
  sleep 2
  VITE_OPENCODE_SERVER_HOST=127.0.0.1 VITE_OPENCODE_SERVER_PORT="$BACKEND_PORT" \
    bun --cwd packages/app dev -- --port "$APP_PORT"
}

start_electron() {
  kill_existing
  echo "Starting backend on port $BACKEND_PORT..."
  bun run --cwd packages/opencode --conditions=browser ./src/index.ts serve --port "$BACKEND_PORT" &
  BACKEND_PID=$!

  cleanup() {
    echo "Shutting down..."
    kill "$BACKEND_PID" 2>/dev/null || true
    exit 0
  }
  trap cleanup INT TERM

  echo "Backend started (PID $BACKEND_PID). Starting Electron app..."
  sleep 2
  OPENCODE_PORT="$BACKEND_PORT" \
  VITE_OPENCODE_SERVER_HOST=127.0.0.1 VITE_OPENCODE_SERVER_PORT="$BACKEND_PORT" \
    bun run dev:desktop-electron
}

usage() {
  echo "Usage: ./start.sh --web | --electron"
  echo ""
  echo "  --web      Backend + web app (http://localhost:$APP_PORT)"
  echo "  --electron Electron desktop app"
  echo ""
  echo "Env: BACKEND_PORT (default 4096), APP_PORT (default 3000)"
  exit 1
}

case "${1:-}" in
  --web)     start_web ;;
  --electron) start_electron ;;
  *)         usage ;;
esac
