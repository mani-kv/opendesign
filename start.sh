#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

BACKEND_PORT="${BACKEND_PORT:-4096}"
APP_PORT="${APP_PORT:-3000}"

start_web() {
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
