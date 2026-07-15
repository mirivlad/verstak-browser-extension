#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAGICK="${MAGICK_BIN:-magick}"
SOURCE="$ROOT/shared/icons/verstak.svg"

if ! command -v "$MAGICK" >/dev/null; then
  echo "ImageMagick is required to generate browser extension icons: $MAGICK not found" >&2
  exit 1
fi

for size in 16 48 128; do
  "$MAGICK" -background none "$SOURCE" -resize "${size}x${size}" \
    "PNG32:$ROOT/shared/icons/icon${size}.png"
done

echo "generated browser extension icons from $SOURCE"
