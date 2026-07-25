#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "=== Vidora Setup ==="

echo "[1/4] Python virtual environment..."
cd "$ROOT/backend"
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    echo "  ✔ Created .venv"
else
    echo "  ✔ .venv already exists"
fi
source .venv/bin/activate
pip install -r requirements.txt
echo "  ✔ Python deps installed"

echo "[2/4] Frontend dependencies..."
cd "$ROOT/frontend"
pnpm install
echo "  ✔ Frontend deps installed"

echo "[3/4] Remotion dependencies..."
cd "$ROOT/backend/remotion-project"
npm install
echo "  ✔ Remotion deps installed"

echo "[4/4] Environment file..."
cd "$ROOT"
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "  ✔ Created .env from .env.example"
else
    echo "  ✔ .env already exists"
fi

echo ""
echo "=== Setup complete! ==="
echo "Run: cd frontend && pnpm dev:all"
