#!/bin/bash
set -euo pipefail

OUTPUT=""
DELAY=0
WINDOW_MODE=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$(cd "$SCRIPT_DIR/../output" && pwd 2>/dev/null || true)"

mkdir -p "$SCRIPT_DIR/../output"
OUTPUT_DIR="$(cd "$SCRIPT_DIR/../output" && pwd)"

usage() {
  cat <<'EOF'
Usage: capture.sh [--output PATH] [--delay SECONDS] [--window]

Options:
  --output PATH     Save screenshot to PATH
  --delay SECONDS   Wait N seconds before capture
  --window          Capture a user-selected window (interactive)
  -h, --help        Show help
EOF
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      OUTPUT="${2:-}"
      shift 2
      ;;
    --delay)
      DELAY="${2:-0}"
      shift 2
      ;;
    --window)
      WINDOW_MODE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

if [[ -z "$OUTPUT" ]]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  OUTPUT="$OUTPUT_DIR/screen-${TS}.png"
fi

mkdir -p "$(dirname "$OUTPUT")"

if ! command -v screencapture >/dev/null 2>&1; then
  fail "screencapture not found; this skill requires macOS."
fi

if [[ ! "$DELAY" =~ ^[0-9]+$ ]]; then
  fail "--delay must be an integer number of seconds"
fi

if [[ "$DELAY" != "0" ]]; then
  sleep "$DELAY"
fi

SCREENCAPTURE_ARGS=(-x)
if [[ "$WINDOW_MODE" -eq 1 ]]; then
  SCREENCAPTURE_ARGS+=(-w)
fi
SCREENCAPTURE_ARGS+=("$OUTPUT")

ERR_FILE="$(mktemp -t openclaw-screencapture.XXXXXX.log)"
cleanup() {
  rm -f "$ERR_FILE"
}
trap cleanup EXIT

if ! screencapture "${SCREENCAPTURE_ARGS[@]}" 2>"$ERR_FILE"; then
  ERR_MSG="$(cat "$ERR_FILE" 2>/dev/null || true)"
  if [[ -z "$ERR_MSG" ]]; then
    ERR_MSG="screencapture exited with a non-zero status"
  fi
  fail "Screenshot capture failed. $ERR_MSG"
fi

if [[ ! -f "$OUTPUT" ]]; then
  ERR_MSG="$(cat "$ERR_FILE" 2>/dev/null || true)"
  fail "Screenshot command finished but no file was created at: $OUTPUT${ERR_MSG:+ | stderr: $ERR_MSG}"
fi

if [[ ! -s "$OUTPUT" ]]; then
  fail "Screenshot file was created but is empty: $OUTPUT"
fi

printf '%s\n' "$OUTPUT"
