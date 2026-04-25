#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="${ROOT_DIR}/.server.pid"
LOG_FILE="${ROOT_DIR}/.server.log"
PORT="${LEAD_OPS_PORT:-8000}"
APP_NAME="霸霸精准流量获取工具"

if [[ -f "${PID_FILE}" ]]; then
  EXISTING_PID="$(cat "${PID_FILE}")"
  if ps -p "${EXISTING_PID}" >/dev/null 2>&1; then
    echo "server already running on pid ${EXISTING_PID}"
    exit 0
  fi
  rm -f "${PID_FILE}"
fi

if command -v lsof >/dev/null 2>&1; then
  LISTEN_PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [[ -n "${LISTEN_PID}" ]]; then
    echo "port ${PORT} is already in use by pid ${LISTEN_PID}"
    echo "set LEAD_OPS_PORT to another port, for example:"
    echo "  LEAD_OPS_PORT=8001 zsh ${ROOT_DIR}/scripts/start_server.sh"
    exit 1
  fi
fi

source "${ROOT_DIR}/.venv/bin/activate"
if command -v setsid >/dev/null 2>&1; then
  setsid "${ROOT_DIR}/.venv/bin/uvicorn" app.main:app \
    --host 127.0.0.1 \
    --port "${PORT}" \
    --app-dir "${ROOT_DIR}" \
    >"${LOG_FILE}" 2>&1 </dev/null &
else
  nohup "${ROOT_DIR}/.venv/bin/uvicorn" app.main:app \
    --host 127.0.0.1 \
    --port "${PORT}" \
    --app-dir "${ROOT_DIR}" \
    >"${LOG_FILE}" 2>&1 </dev/null &
fi

echo $! >"${PID_FILE}"
disown 2>/dev/null || true
sleep 2
HEALTH="$(curl -fsS "http://127.0.0.1:${PORT}/api/health" || true)"
if [[ "${HEALTH}" != *"\"app\":\"${APP_NAME}\""* ]]; then
  STARTED_PID="$(cat "${PID_FILE}")"
  kill "${STARTED_PID}" >/dev/null 2>&1 || true
  rm -f "${PID_FILE}"
  echo "server failed health check on port ${PORT}"
  echo "response: ${HEALTH:-<empty>}"
  exit 1
fi
echo "server started: http://127.0.0.1:${PORT}/"
