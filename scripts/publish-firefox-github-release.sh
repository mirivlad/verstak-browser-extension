#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REPOSITORY="mirivlad/verstak-browser-extension"
SOURCE_DIR="${VERSTAK_FIREFOX_SOURCE_DIR:-dist/firefox}"
RELEASE_DIR="${VERSTAK_FIREFOX_RELEASE_DIR:-release/firefox}"
RELEASE_NOTES_DIR="${VERSTAK_RELEASE_NOTES_DIR:-release-notes}"
GIT_BIN="${GIT_BIN:-git}"
GH_BIN="${GH_BIN:-gh}"

if ! command -v "$GH_BIN" >/dev/null; then
  echo "ERROR: gh CLI is required to publish a GitHub Release" >&2
  exit 1
fi
if [[ "$("$GIT_BIN" branch --show-current)" != "main" ]]; then
  echo "ERROR: GitHub releases must be published from main" >&2
  exit 1
fi
if [[ -n "$("$GIT_BIN" status --porcelain)" ]]; then
  echo "ERROR: working tree must be clean before publishing a release" >&2
  exit 1
fi

"$GH_BIN" auth status
"$GIT_BIN" fetch origin main --tags
HEAD="$("$GIT_BIN" rev-parse HEAD)"
if [[ "$HEAD" != "$("$GIT_BIN" rev-parse origin/main)" ]]; then
  echo "ERROR: local main must match origin/main before publishing a release" >&2
  exit 1
fi
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

if "$GIT_BIN" rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  if [[ "$("$GIT_BIN" rev-parse "${TAG}^{commit}")" != "$HEAD" ]]; then
    echo "ERROR: existing tag $TAG does not point at HEAD" >&2
    exit 1
  fi
else
  "$GIT_BIN" tag -a "$TAG" -m "Release $TAG"
  "$GIT_BIN" push origin "refs/tags/$TAG"
fi

if "$GH_BIN" release view "$TAG" --repo "$REPOSITORY" >/dev/null 2>&1; then
  "$GH_BIN" release upload "$TAG" "$XPI" "$UPDATES" --repo "$REPOSITORY" --clobber
else
  NOTES_FILE="$RELEASE_NOTES_DIR/$TAG.md"
  if [[ ! -s "$NOTES_FILE" ]]; then
    echo "ERROR: human-readable release notes are required: $NOTES_FILE" >&2
    exit 1
  fi

  RELEASE_OPTIONS=(--notes-file "$NOTES_FILE" --generate-notes --latest --verify-tag)
  PREVIOUS_TAG="$("$GIT_BIN" describe --tags --abbrev=0 "${HEAD}^" 2>/dev/null || true)"
  if [[ -n "$PREVIOUS_TAG" ]]; then
    RELEASE_OPTIONS+=(--notes-start-tag "$PREVIOUS_TAG")
  fi
  "$GH_BIN" release create "$TAG" "$XPI" "$UPDATES" \
    --repo "$REPOSITORY" \
    --title "Verstak Browser Extension $VERSION" \
    "${RELEASE_OPTIONS[@]}"
fi

echo "GitHub release:"
"$GH_BIN" release view "$TAG" --repo "$REPOSITORY" --json url --jq .url
