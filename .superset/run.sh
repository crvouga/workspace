#!/usr/bin/env bash
# Superset and super.engineering run hook: start only the portfolio app on a
# free port so parallel worktrees do not collide. PORT overrides the default.
set -euo pipefail

ws="${SUPERSET_WORKSPACE_PATH:-$(pwd)}"
cd "$ws"

port_free() { ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

port="${PORT:-4321}"
while ! port_free "$port"; do
  port=$((port + 1))
  if ((port > 4521)); then
    echo "no free port in 4321-4521" >&2
    exit 1
  fi
done

echo "$port" > .superset/.run-port
echo $$ > .superset/.run-pid
echo "dev server: http://localhost:$port"
export PORT="$port"
exec bun run --filter @pkgs/portfolio dev -- --host 0.0.0.0 --port "$port"
