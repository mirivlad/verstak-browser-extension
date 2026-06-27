#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

load_env_file() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return 0
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ "$value" == \"*\" && "$value" == *\" ]]; then
        value="${value:1:${#value}-2}"
      elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
        value="${value:1:${#value}-2}"
      fi
      export "$key=$value"
    fi
  done < "$env_file"
}

ENV_FILE="${VERSTAK_BROWSER_ENV:-$ROOT_DIR/.env}"
load_env_file "$ENV_FILE"

SOURCE_DIR="${VERSTAK_FIREFOX_SOURCE_DIR:-dist/firefox}"
ARTIFACTS_DIR="${WEB_EXT_ARTIFACTS_DIR:-web-ext-artifacts}"
CHANNEL="${WEB_EXT_CHANNEL:-unlisted}"

if [[ -z "${WEB_EXT_API_KEY:-}" ]]; then
  echo "ERROR: WEB_EXT_API_KEY is not set" >&2
  exit 1
fi

if [[ -z "${WEB_EXT_API_SECRET:-}" ]]; then
  echo "ERROR: WEB_EXT_API_SECRET is not set" >&2
  exit 1
fi

if [[ "$CHANNEL" != "unlisted" ]]; then
  echo "ERROR: only WEB_EXT_CHANNEL=unlisted is allowed for self-distributed builds" >&2
  exit 1
fi

if [[ -z "${WEB_EXT_API_PROXY:-}" ]]; then
  echo "ERROR: WEB_EXT_API_PROXY is required for Firefox signing" >&2
  exit 1
fi

npm run build

if [[ ! -f "$SOURCE_DIR/manifest.json" ]]; then
  echo "ERROR: manifest.json not found in $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$ARTIFACTS_DIR"

echo "Linting Firefox extension..."
npx web-ext lint \
  --source-dir "$SOURCE_DIR" \
  --self-hosted

echo "Signing Firefox extension as unlisted/self-distributed XPI..."
SIGN_ARGS=(
  sign
  --source-dir "$SOURCE_DIR"
  --artifacts-dir "$ARTIFACTS_DIR"
  --channel "$CHANNEL"
  --timeout "${WEB_EXT_TIMEOUT:-600000}"
  --approval-timeout "${WEB_EXT_APPROVAL_TIMEOUT:-600000}"
  --api-key "$WEB_EXT_API_KEY"
  --api-secret "$WEB_EXT_API_SECRET"
  --api-proxy "$WEB_EXT_API_PROXY"
)

echo "Using AMO API proxy from WEB_EXT_API_PROXY"

npx web-ext "${SIGN_ARGS[@]}"

SIGNED_XPI="$(find "$ARTIFACTS_DIR" -maxdepth 1 -type f -name '*.xpi' | sort | tail -n 1 || true)"
if [[ -z "$SIGNED_XPI" ]]; then
  echo "ERROR: signed XPI was not created in $ARTIFACTS_DIR" >&2
  exit 1
fi

echo "Signed XPI created:"
echo "$SIGNED_XPI"
