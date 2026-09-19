#!/usr/bin/env bash
# Superset teardown: stop the dev server started by run.sh (setup starts nothing).
set -uo pipefail

ws="${SUPERSET_WORKSPACE_PATH:-$(pwd)}"
cd "$ws" || exit 0

if [[ -f .superset/.run-pid ]]; then
  pid="$(cat .superset/.run-pid)"
  if kill -0 "$pid" 2>/dev/null; then
    pkill -TERM -P "$pid" 2>/dev/null
    kill -TERM "$pid" 2>/dev/null
    echo "stopped dev server (pid $pid)"
  fi
fi

# Fallback: anything still listening on the recorded port from this worktree.
if [[ -f .superset/.run-port ]]; then
  port="$(cat .superset/.run-port)"
  for pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null); do
    if [[ "$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" == "$ws"* ]]; then
      kill -TERM "$pid" 2>/dev/null && echo "stopped pid $pid on port $port"
    fi
  done
fi

rm -f .superset/.run-pid .superset/.run-port
exit 0
