#!/usr/bin/env bash
# Superset and super.engineering workspace setup for the portfolio app.
# Copy its untracked local environment from the primary checkout, then install
# the monorepo dependencies. Idempotent — safe to re-run.
set -euo pipefail

ws="${SUPERSET_WORKSPACE_PATH:-$(pwd)}"
cd "$ws"

# Superset provides SUPERSET_ROOT_PATH. super.engineering runs hooks from the
# worktree, so fall back to Git's primary-worktree entry there.
root="${SUPERSET_ROOT_PATH:-}"
if [[ -z "$root" ]]; then
  root="$(git worktree list --porcelain | awk '/^worktree / { print substr($0, 10); exit }')"
fi

rel="packages/portfolio/.env"
if [[ -n "$root" && "$(cd "$root" && pwd -P)" != "$(pwd -P)" ]]; then
  src="$root/$rel"
  if [[ -f "$src" && ! -e "$rel" ]]; then
    mkdir -p "$(dirname "$rel")"
    cp -p "$src" "$rel"
    echo "copied $rel"
  fi
fi

bun install --frozen-lockfile
