#!/bin/zsh

set -u

PROJECT_DIR="/Users/jos/Documents/Codex/2026-08-18/rhodesian-ridgeback"
URL="http://localhost:3000/"
NPM_BIN="/Users/jos/.nvm/versions/node/v22.20.0/bin/npm"

cd "$PROJECT_DIR" || exit 1

echo "DriftOS local server"
echo "$URL"
echo "Keep this window open to keep localhost:3000 available."
echo

if /usr/sbin/lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Ready: $URL"
  open "$URL"
  exit 0
fi

trap 'echo; echo "DriftOS stopped."; exit 0' INT TERM

(
  for _ in {1..30}; do
    if /usr/bin/curl -fsS "$URL" >/dev/null 2>&1; then
      echo "Ready: $URL"
      open "$URL"
      exit 0
    fi
    sleep 1
  done
) &

while true; do
  "$NPM_BIN" run start
  status=$?
  if [[ $status -eq 130 || $status -eq 143 ]]; then
    break
  fi
  echo
  echo "Server stopped (exit $status). Restarting in 2 seconds..."
  sleep 2
done
