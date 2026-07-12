#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"

if [[ $# -gt 1 || ( $# -eq 1 && "$1" != "v$VERSION" && "$1" != "$VERSION" ) ]]; then
  echo "usage: $0 [v$VERSION]" >&2
  exit 2
fi

exec "$ROOT/scripts/publish-firefox-github-release.sh"
