#!/usr/bin/env bash
set -euo pipefail

# --- configurable knobs ---
PY_VER="${PY_VER:-3.11}"
DB_PATH="${DB_PATH:-data/stepinto.db}"
TRANSPORT="${1:-stdio}"   # stdio | http
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8765}"
# --------------------------

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 0) refuse iCloud Drive (venvs + iCloud = flaky metadata writes)
if [[ "$REPO_DIR" == *"/Library/Mobile Documents/"* ]]; then
  echo "ERROR: Project is inside iCloud Drive. Move it (e.g., to ~/Developer) and re-run." >&2
  exit 1
fi

# 1) ensure uv exists
if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv with Homebrew..."
  if ! command -v brew >/dev/null 2>&1; then
    echo "ERROR: brew not found. Install uv manually: https://docs.astral.sh/uv/" >&2
    exit 1
  fi
  brew install uv
fi

# 2) ensure and pin the right Python; build env with deps
uv python install "$PY_VER" >/dev/null
uv python pin "$PY_VER"

cd "$REPO_DIR/.."
PROJECT_ROOT="$(pwd)"
cd "$PROJECT_ROOT"

rm -rf .venv
export UV_LINK_MODE=copy   # silence reflink warnings on external volumes
uv sync                    # creates .venv and installs all deps from pyproject

# 3) ingest the catalog into SQLite
uv run -m stepintovision_ingest.ingest --db "$DB_PATH"

# 4) run the server in the right transport
export STEPINTOVISION_DB="$PROJECT_ROOT/$DB_PATH"
case "$TRANSPORT" in
  stdio)
    echo "Starting MCP server (stdio). Keep this terminal open."
    exec uv run stepinto-mcp
    ;;
  http)
    echo "Starting MCP server (http) on http://$HOST:$PORT/mcp"
    exec uv run python -m stepintovision_mcp.server --transport http --host "$HOST" --port "$PORT"
    ;;
  *)
    echo "ERROR: Unknown transport '$TRANSPORT' (use: stdio | http)" >&2
    exit 1
    ;;
esac