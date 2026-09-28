#!/usr/bin/env bash
# Superset run: start the turborepo-remote-cache dev server on a free port so
# parallel workspaces don't collide on 8787. PORT from the environment
# overrides the value in packages/turborepo-remote-cache/.env.
set -euo pipefail

ws="${SUPERSET_WORKSPACE_PATH:-$(pwd)}"
cd "$ws"

port_free() { ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

port="${PORT:-8787}"
while ! port_free "$port"; do
  port=$((port + 1))
  if ((port > 8987)); then
    echo "no free port in 8787-8987" >&2
    exit 1
  fi
done

echo "$port" > .superset/.run-port
echo $$ > .superset/.run-pid
echo "dev server: http://localhost:$port"
export PORT="$port"
exec bun run dev
