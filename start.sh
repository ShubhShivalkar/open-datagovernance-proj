#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/.venv"
PYTHON="$VENV/bin/python"
BACKEND="$ROOT/app/backend"
FRONTEND="$ROOT/app/frontend"
OLLAMA_BIN="/Applications/Ollama.app/Contents/Resources/ollama"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}  Data Guardian — starting all servers${RESET}"
echo ""

# ── Virtual environment ───────────────────────────────────────────────────────
if [ ! -f "$PYTHON" ]; then
  echo -e "  ${YELLOW}!${RESET} Virtual environment not found at $VENV"
  echo -e "      Run: python -m venv \"$VENV\" && \"$VENV/bin/pip\" install -r \"$BACKEND/requirements.txt\""
  exit 1
fi
# shellcheck source=/dev/null
source "$VENV/bin/activate"
echo -e "  ${GREEN}✓${RESET} Virtual environment activated"

# Opens a command in a new Terminal.app window with a custom title.
# Args: $1 = window title, $2+ = passed to AppleScript as argv items
open_in_terminal() {
  local title="$1"
  local cmd="$2"
  osascript - "$title" "$cmd" <<'APPLESCRIPT'
on run argv
  set winTitle to item 1 of argv
  set shellCmd to item 2 of argv
  tell application "Terminal"
    set w to (do script shellCmd)
    set custom title of w to winTitle
    activate
  end tell
end run
APPLESCRIPT
}

# ── Ollama ────────────────────────────────────────────────────────────────────
if lsof -i :11434 2>/dev/null | grep -q LISTEN; then
  echo -e "  ${GREEN}✓${RESET} Ollama already running on :11434"
elif [ -f "$OLLAMA_BIN" ]; then
  open_in_terminal "Ollama :11434" "$OLLAMA_BIN serve"
  echo -e "  ${GREEN}✓${RESET} Ollama — new terminal opened"
else
  echo -e "  ${YELLOW}!${RESET} Ollama not found at $OLLAMA_BIN — skipping"
fi

# ── Django backend ────────────────────────────────────────────────────────────
DJANGO_CMD="cd $(printf '%q' "$BACKEND") && $(printf '%q' "$PYTHON") manage.py runserver"
open_in_terminal "Django :8000" "$DJANGO_CMD"
echo -e "  ${GREEN}✓${RESET} Django — new terminal opened  :8000"

# ── Vite frontend ─────────────────────────────────────────────────────────────
VITE_CMD="cd $(printf '%q' "$FRONTEND") && npm run dev"
open_in_terminal "Vite :5173" "$VITE_CMD"
echo -e "  ${GREEN}✓${RESET} Vite   — new terminal opened  :5173"

echo ""
echo -e "  ${CYAN}App:${RESET}    http://localhost:5173"
echo -e "  ${CYAN}API:${RESET}    http://localhost:8000"
echo -e "  ${CYAN}Ollama:${RESET} http://localhost:11434"
echo ""
echo -e "  Login: ${CYAN}admin${RESET} / whatever you set SEED_ADMIN_PASSWORD to in .env"
echo ""
