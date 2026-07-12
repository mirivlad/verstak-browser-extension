#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REPOSITORY="mirivlad/verstak-browser-extension"
SOURCE_DIR="${VERSTAK_FIREFOX_SOURCE_DIR:-dist/firefox}"
RELEASE_DIR="${VERSTAK_FIREFOX_RELEASE_DIR:-release/firefox}"

if ! command -v gh >/dev/null; then
  echo "ERROR: gh CLI is required to publish a GitHub Release" >&2
  exit 1
fi

gh auth status
./scripts/release-firefox-xpi.sh

VERSION="$(node -e "console.log(require('./${SOURCE_DIR}/manifest.json').version)")"
TAG="v${VERSION}"
XPI="$RELEASE_DIR/verstak-firefox-${VERSION}.xpi"
UPDATES="$RELEASE_DIR/updates.json"

for artifact in "$XPI" "$UPDATES"; do
  if [[ ! -f "$artifact" ]]; then
    echo "ERROR: release artifact not found: $artifact" >&2
    exit 1
  fi
done

if gh release view "$TAG" --repo "$REPOSITORY" >/dev/null 2>&1; then
  gh release upload "$TAG" "$XPI" "$UPDATES" --repo "$REPOSITORY" --clobber
else
  gh release create "$TAG" "$XPI" "$UPDATES" \
    --repo "$REPOSITORY" \
    --title "Verstak Browser Extension $VERSION" \
    --generate-notes \
    --latest \
    --target "$(git rev-parse HEAD)"
fi

echo "GitHub release:"
gh release view "$TAG" --repo "$REPOSITORY" --json url --jq .url
