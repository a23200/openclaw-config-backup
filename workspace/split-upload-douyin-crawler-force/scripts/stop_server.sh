#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="${ROOT_DIR}/.server.pid"

if [[ ! -f "${PID_FILE}" ]]; then
  echo "server not running"
  exit 0
fi

PID="$(cat "${PID_FILE}")"
if ps -p "${PID}" >/dev/null 2>&1; then
  kill "${PID}"
  echo "server stopped: pid ${PID}"
else
  echo "stale pid file removed"
fi

rm -f "${PID_FILE}"
