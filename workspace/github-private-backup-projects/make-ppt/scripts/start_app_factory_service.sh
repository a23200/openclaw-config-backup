#!/bin/zsh
set -euo pipefail

REPO_DIR="/Users/mac/Desktop/项目总表/make-ppt"
LOG_DIR="$REPO_DIR/runtime/app-factory/logs"
NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"
APP_FACTORY_PORT="${APP_FACTORY_PORT:-4321}"

mkdir -p "$LOG_DIR"
cd "$REPO_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

existing_pid="$(lsof -tiTCP:${APP_FACTORY_PORT} -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
if [[ -n "$existing_pid" ]]; then
  existing_cmd="$(ps -p "$existing_pid" -o command= 2>/dev/null || true)"
  if [[ "$existing_cmd" == *"scripts/app-factory-preview.cjs"* ]]; then
    echo "[app-factory] already listening on ${APP_FACTORY_PORT} with pid ${existing_pid}"
    exit 0
  fi
  echo "[app-factory] port ${APP_FACTORY_PORT} already occupied by: ${existing_cmd}" >&2
  exit 1
fi

exec "$NODE_BIN" scripts/app-factory-preview.cjs
