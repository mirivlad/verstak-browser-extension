#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-}"

if [[ -z "$VERSION" || ! "$VERSION" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "usage: $0 <version>" >&2
  echo "example: $0 v0.1.0-alpha.1" >&2
  exit 2
fi

echo "=== verstak browser extension release $VERSION ==="
(cd "$ROOT" && npm ci --no-audit --no-fund && npm test && npm run build)

RELEASE_ROOT="$ROOT/release"
STAGING="$RELEASE_ROOT/verstak-browser-extension-$VERSION"
ARCHIVE="$RELEASE_ROOT/verstak-browser-extension-$VERSION.tar.gz"
rm -rf "$STAGING" "$ARCHIVE"
mkdir -p "$STAGING"

cp "$ROOT/README.md" "$ROOT/LICENSE" "$STAGING/"
cp -R "$ROOT/dist" "$STAGING/dist"
tar -C "$RELEASE_ROOT" -czf "$ARCHIVE" "$(basename "$STAGING")"
(cd "$RELEASE_ROOT" && sha256sum "$(basename "$ARCHIVE")" > SHA256SUMS)

echo "release archive: $ARCHIVE"
echo "checksums:       $RELEASE_ROOT/SHA256SUMS"
