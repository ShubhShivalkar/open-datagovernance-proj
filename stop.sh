#!/usr/bin/env bash

GREEN='\033[0;32m'
CYAN='\033[0;36m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}  Data Guardian — stopping all servers${RESET}"
echo ""

kill_port() {
  local port=$1
  local name=$2
  local pids
  pids=$(lsof -ti :$port 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null
    echo -e "  ${GREEN}✓${RESET} $name stopped"
  else
    echo -e "  — $name not running"
  fi
}

kill_port 8000  "Django   :8000"
kill_port 5173  "Vite     :5173"
kill_port 11434 "Ollama   :11434"

echo ""
