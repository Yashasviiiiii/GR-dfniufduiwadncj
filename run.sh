#!/usr/bin/env bash
set -e

# Windows Python that has uvicorn installed (via /mnt/c path for WSL)
PYTHON="/mnt/c/Users/yashasvi/AppData/Local/Programs/Python/Python314/python.exe"

# Fallback: try native python/py if the above doesn't work
if ! "$PYTHON" --version >/dev/null 2>&1; then
  PYTHON=$(command -v python || command -v py || command -v python3)
fi

echo "Using Python: $PYTHON"

# Production mode: build frontend and serve via FastAPI on port 8000
if [ "$1" = "--prod" ] || [ "$1" = "--build" ]; then
  echo "Building frontend..."
  (cd frontend && npm install && npm run build)
  echo "Starting server on http://localhost:8000 ..."
  (cd backend && "$PYTHON" -m uvicorn main:app --port 8000)
  exit 0
fi

# Dev mode: run backend and frontend concurrently
trap 'kill $(jobs -p) 2>/dev/null' EXIT INT TERM

[ -d "frontend/node_modules" ] || (cd frontend && npm install)

echo "Starting backend on http://localhost:8000 ..."
(cd backend && "$PYTHON" -m uvicorn main:app --port 8000) &

sleep 2   # give the backend time to bind before Vite starts

echo "Starting frontend on http://localhost:5173 ..."
(cd frontend && npm run dev) &

wait
