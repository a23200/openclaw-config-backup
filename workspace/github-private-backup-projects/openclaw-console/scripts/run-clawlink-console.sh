#!/bin/zsh

set -euo pipefail

REPO_DIR="/Users/mac/openclaw-console"
NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"
NPM_BIN="${NPM_BIN:-/opt/homebrew/bin/npm}"
PORT="${PORT:-3000}"
DIST_INDEX="$REPO_DIR/dist/index.html"

cd "$REPO_DIR"

needs_build=0

if [[ ! -f "$DIST_INDEX" ]]; then
  needs_build=1
elif [[ "$REPO_DIR/package.json" -nt "$DIST_INDEX" ]] || [[ "$REPO_DIR/vite.config.js" -nt "$DIST_INDEX" ]]; then
  needs_build=1
elif find "$REPO_DIR/src" -type f -newer "$DIST_INDEX" -print -quit | grep -q .; then
  needs_build=1
fi

if [[ "$needs_build" -eq 1 ]]; then
  "$NPM_BIN" run build
fi

exec env PORT="$PORT" "$NODE_BIN" "$REPO_DIR/server.mjs"
