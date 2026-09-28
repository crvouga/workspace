#!/usr/bin/env bash
# Superset workspace setup: copy untracked local files from the main checkout,
# then install dependencies. Idempotent — safe to re-run.
set -euo pipefail

root="${SUPERSET_ROOT_PATH:?SUPERSET_ROOT_PATH is not set}"
ws="${SUPERSET_WORKSPACE_PATH:-$(pwd)}"
cd "$ws"

# Gitignored files that a fresh worktree needs (paths relative to repo root).
# Missing sources are skipped; existing copies in the workspace are kept.
untracked_files=(
  packages/turborepo-remote-cache/.env
  packages/9router/.env
  packages/vault-service/.env.secrets
  .vault-token
)

if [[ "$(cd "$root" && pwd -P)" != "$(pwd -P)" ]]; then
  for rel in "${untracked_files[@]}"; do
    src="$root/$rel"
    if [[ -f "$src" && ! -e "$rel" ]]; then
      mkdir -p "$(dirname "$rel")"
      cp -p "$src" "$rel"
      echo "copied $rel"
    fi
  done
fi

bun install --frozen-lockfile
