#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="${ROOT_DIR}/.server.pid"
LOG_FILE="${ROOT_DIR}/.server.log"

if [[ -f "${PID_FILE}" ]]; then
  EXISTING_PID="$(cat "${PID_FILE}")"
  if ps -p "${EXISTING_PID}" >/dev/null 2>&1; then
    echo "server already running on pid ${EXISTING_PID}"
    exit 0
  fi
  rm -f "${PID_FILE}"
fi

source "${ROOT_DIR}/.venv/bin/activate"
if command -v setsid >/dev/null 2>&1; then
  setsid "${ROOT_DIR}/.venv/bin/uvicorn" app.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --app-dir "${ROOT_DIR}" \
    >"${LOG_FILE}" 2>&1 </dev/null &
else
  nohup "${ROOT_DIR}/.venv/bin/uvicorn" app.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --app-dir "${ROOT_DIR}" \
    >"${LOG_FILE}" 2>&1 </dev/null &
fi

echo $! >"${PID_FILE}"
disown 2>/dev/null || true
sleep 2
curl -fsS http://127.0.0.1:8000/api/health >/dev/null
echo "server started: http://127.0.0.1:8000/"
