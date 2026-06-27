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
RELEASE_DIR="${VERSTAK_FIREFOX_RELEASE_DIR:-release/firefox}"
UPDATE_BASE_URL="${VERSTAK_FIREFOX_UPDATE_BASE_URL:-https://mirv.top/verstak/firefox}"

./scripts/sign-firefox-xpi.sh

VERSION="$(node -e "console.log(require('./${SOURCE_DIR}/manifest.json').version)")"
ADDON_ID="$(node -e "console.log(require('./${SOURCE_DIR}/manifest.json').browser_specific_settings.gecko.id)")"

if [[ -z "$VERSION" || -z "$ADDON_ID" ]]; then
  echo "ERROR: could not read Firefox manifest version/addon id" >&2
  exit 1
fi

SIGNED_XPI="$(find "$ARTIFACTS_DIR" -maxdepth 1 -type f -name '*.xpi' | sort | tail -n 1 || true)"
if [[ -z "$SIGNED_XPI" ]]; then
  echo "ERROR: no signed XPI found in $ARTIFACTS_DIR" >&2
  exit 1
fi

mkdir -p "$RELEASE_DIR"
RELEASE_XPI="verstak-firefox-${VERSION}.xpi"
cp "$SIGNED_XPI" "$RELEASE_DIR/$RELEASE_XPI"

cat > "$RELEASE_DIR/updates.json" <<EOF
{
  "addons": {
    "${ADDON_ID}": {
      "updates": [
        {
          "version": "${VERSION}",
          "update_link": "${UPDATE_BASE_URL}/${RELEASE_XPI}"
        }
      ]
    }
  }
}
EOF

echo "Firefox release artifacts:"
echo "$RELEASE_DIR/$RELEASE_XPI"
echo "$RELEASE_DIR/updates.json"
