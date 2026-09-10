#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../cli/lib/vault-auth.sh
source "${REPO_ROOT}/cli/lib/vault-auth.sh"
# shellcheck source=lib/vault-kv.sh
source "${SCRIPT_DIR}/lib/vault-kv.sh"

MOUNT_PATH="${VAULT_KV_DEFAULT_MOUNT}"
TARGET_PROJECT="${VAULT_KV_DEFAULT_PROJECT}"
TARGET_CONFIG="prd"
LEGACY_PATH_NAME="secret"
DRY_RUN=true
OVERWRITE_CONFLICTS=false
KEEP_SOURCE=false

SRC_RAW=""
DST_RAW=""
PATCH_FILE=""
KEYS_ADDED=0
KEYS_SKIPPED_EQUAL=0
KEYS_SKIPPED_CONFLICT=0
KEYS_OVERWRITTEN=0
SOURCE_DELETED=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Merge the legacy leaf secret at <mount>/secret into <mount>/personal/prd,
then permanently delete the legacy path so only personal/ remains under the mount.

Default (dry-run): print the plan without writing or deleting.

By default, keys already present in personal/prd are left unchanged (conflicts
are reported). Pass --overwrite-conflicts to take values from the legacy path.

Options:
  --mount PATH              KV v2 mount path (default: secret)
  --target-project NAME     Destination project (default: personal)
  --target-config NAME      Destination config (default: prd)
  --legacy-path NAME        Legacy leaf under the mount (default: secret)
  --confirm                 Apply: patch personal/prd and delete the legacy path
  --overwrite-conflicts     Overwrite personal/prd keys that differ from legacy
  --keep-source             After merge, do not delete the legacy path
  --dry-run                 Plan only (default)
  -h, --help                Show this help

Environment:
  VAULT_ADDR                Vault API address (default: https://vault.chrisvouga.dev)
  VAULT_TOKEN               Token with write + metadata delete on the mount

Prerequisites:
  vault CLI, jq, curl, python3
  OpenBao initialized and unsealed

Examples:
  ./scripts/vault-run.sh -- ./scripts/cleanup-legacy-secret-path.sh
  ./scripts/vault-run.sh -- ./scripts/cleanup-legacy-secret-path.sh --confirm
  ./scripts/vault-run.sh -- ./scripts/cleanup-legacy-secret-path.sh --confirm --overwrite-conflicts
EOF
}

cleanup() {
  rm -f "${SRC_RAW}" "${DST_RAW}" "${PATCH_FILE}"
}

write_secret_raw() {
  local path="$1"
  local outfile="$2"
  vault_cmd kv get -format=json "$path" >"$outfile"
}

analyze_and_build_patch() {
  python3 - "$SRC_RAW" "$DST_RAW" "$PATCH_FILE" "$OVERWRITE_CONFLICTS" <<'PY'
import json
import sys

src_path, dst_path, patch_path, overwrite = sys.argv[1:5]
overwrite = overwrite == "true"

src = json.load(open(src_path))["data"]["data"] or {}
dst = json.load(open(dst_path))["data"]["data"] or {}

added = {}
equal = []
conflicts = []
overwritten = {}

for key in sorted(src):
    if key not in dst:
        added[key] = src[key]
        continue
    if src[key] == dst[key]:
        equal.append(key)
        continue
    conflicts.append(key)
    if overwrite:
        overwritten[key] = src[key]

patch = {**added, **overwritten}
json.dump(patch, open(patch_path, "w"), ensure_ascii=False, indent=2)

report = {
    "source_key_count": len(src),
    "target_key_count": len(dst),
    "source_only": sorted(added),
    "equal": equal,
    "conflicts": conflicts,
    "overwrite": overwrite,
    "patch_key_count": len(patch),
}
print(json.dumps(report))
PY
}

while [ $# -gt 0 ]; do
  case "$1" in
    --mount)
      MOUNT_PATH="${2#/}"
      MOUNT_PATH="${MOUNT_PATH%/}"
      shift 2
      ;;
    --target-project)
      TARGET_PROJECT="$2"
      shift 2
      ;;
    --target-config)
      TARGET_CONFIG="$2"
      shift 2
      ;;
    --legacy-path)
      LEGACY_PATH_NAME="${2#/}"
      LEGACY_PATH_NAME="${LEGACY_PATH_NAME%/}"
      shift 2
      ;;
    --confirm)
      DRY_RUN=false
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --overwrite-conflicts)
      OVERWRITE_CONFLICTS=true
      shift
      ;;
    --keep-source)
      KEEP_SOURCE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_cmd jq "Install jq: https://jqlang.github.io/jq/"
require_cmd curl "Install curl"
require_cmd python3 "Install python3"

if ! export_vault_auth; then
  exit 1
fi

if ! resolve_vault_bin; then
  echo "ERROR: Vault CLI binary not found." >&2
  exit 1
fi

trap cleanup EXIT

SRC_RAW="$(mktemp)"
DST_RAW="$(mktemp)"
PATCH_FILE="$(mktemp)"
chmod 600 "$SRC_RAW" "$DST_RAW" "$PATCH_FILE"

SOURCE_PATH="${MOUNT_PATH}/${LEGACY_PATH_NAME}"
TARGET_PATH="$(secret_path_for "$MOUNT_PATH" "$TARGET_PROJECT" "$TARGET_CONFIG")"

if ! assert_vault_ready; then
  exit 1
fi

if [ "$LEGACY_PATH_NAME" = "$TARGET_PROJECT" ]; then
  echo "ERROR: Legacy path '${LEGACY_PATH_NAME}' must not equal target project '${TARGET_PROJECT}'" >&2
  exit 1
fi

echo "==> Source (legacy): ${SOURCE_PATH}"
echo "==> Target:          ${TARGET_PATH}"

if ! secret_exists "$SOURCE_PATH"; then
  echo "ERROR: Legacy secret not found at ${SOURCE_PATH}" >&2
  echo "Nothing to clean up — listing ${MOUNT_PATH}/:" >&2
  vault_cmd kv list "${MOUNT_PATH}/" >&2 || true
  exit 1
fi

# Reject if legacy path is a folder (trailing entries) rather than a leaf.
legacy_children="$(vault_cmd kv list -format=json "${SOURCE_PATH}/" 2>/dev/null || echo '[]')"
if echo "$legacy_children" | jq -e 'type == "array" and length > 0' >/dev/null 2>&1; then
  echo "ERROR: ${SOURCE_PATH} looks like a folder, not a leaf secret:" >&2
  echo "$legacy_children" | jq -r '.[]' >&2
  exit 1
fi

if ! secret_exists "$TARGET_PATH"; then
  echo "ERROR: Target secret not found at ${TARGET_PATH}" >&2
  echo "Create ${TARGET_PATH} first (or pass --target-config / --target-project)." >&2
  exit 1
fi

write_secret_raw "$SOURCE_PATH" "$SRC_RAW"
write_secret_raw "$TARGET_PATH" "$DST_RAW"

REPORT_JSON="$(analyze_and_build_patch)"
KEYS_ADDED="$(echo "$REPORT_JSON" | jq -r '.source_only | length')"
KEYS_SKIPPED_EQUAL="$(echo "$REPORT_JSON" | jq -r '.equal | length')"
KEYS_SKIPPED_CONFLICT="$(echo "$REPORT_JSON" | jq -r '.conflicts | length')"
KEYS_OVERWRITTEN=0
if [ "$OVERWRITE_CONFLICTS" = true ]; then
  KEYS_OVERWRITTEN="$KEYS_SKIPPED_CONFLICT"
fi

echo ""
echo "==> Plan"
echo "    Source keys:           $(echo "$REPORT_JSON" | jq -r '.source_key_count')"
echo "    Target keys (before):  $(echo "$REPORT_JSON" | jq -r '.target_key_count')"
echo "    Keys to add:           ${KEYS_ADDED}"
if [ "$KEYS_ADDED" -gt 0 ]; then
  echo "$REPORT_JSON" | jq -r '.source_only[]' | sed 's/^/      + /'
fi
echo "    Keys already equal:    ${KEYS_SKIPPED_EQUAL}"
if [ "$KEYS_SKIPPED_EQUAL" -gt 0 ]; then
  echo "$REPORT_JSON" | jq -r '.equal[]' | sed 's/^/      = /'
fi
echo "    Conflicting keys:      ${KEYS_SKIPPED_CONFLICT}"
if [ "$KEYS_SKIPPED_CONFLICT" -gt 0 ]; then
  echo "$REPORT_JSON" | jq -r '.conflicts[]' | sed 's/^/      ! /'
  if [ "$OVERWRITE_CONFLICTS" = true ]; then
    echo "      (will overwrite with legacy values)"
  else
    echo "      (keeping personal/prd values; pass --overwrite-conflicts to take legacy)"
  fi
fi

PATCH_COUNT="$(echo "$REPORT_JSON" | jq -r '.patch_key_count')"
if [ "$KEEP_SOURCE" = true ]; then
  echo "    Delete legacy path:    no (--keep-source)"
else
  echo "    Delete legacy path:    yes (kv metadata delete ${SOURCE_PATH})"
fi

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "Dry run only — no changes written."
  echo "Re-run with --confirm to apply."
  exit 0
fi

echo ""
if [ "$PATCH_COUNT" -gt 0 ]; then
  echo "==> Patching ${TARGET_PATH} with ${PATCH_COUNT} key(s)..."
  vault_cmd kv patch "$TARGET_PATH" @"$PATCH_FILE"
else
  echo "==> No keys to patch on ${TARGET_PATH}"
fi

if [ "$KEEP_SOURCE" = true ]; then
  echo "==> Leaving legacy path ${SOURCE_PATH} in place (--keep-source)"
else
  echo "==> Permanently deleting legacy path ${SOURCE_PATH} (metadata delete)..."
  vault_cmd kv metadata delete "$SOURCE_PATH"
  SOURCE_DELETED=true
fi

echo ""
echo "================================================================================"
echo "Cleanup complete"
echo "================================================================================"
echo ""
echo "Keys added:              ${KEYS_ADDED}"
echo "Keys overwritten:        ${KEYS_OVERWRITTEN}"
echo "Conflicts left as-is:    $(( KEYS_SKIPPED_CONFLICT - KEYS_OVERWRITTEN ))"
echo "Legacy path deleted:     ${SOURCE_DELETED}"
echo ""
echo "Verify:"
echo "  vault kv list ${MOUNT_PATH}/"
echo "  vault kv get -format=json ${TARGET_PATH} | jq '.data.data | keys'"
