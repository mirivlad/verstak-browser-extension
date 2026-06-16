#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== verstak-browser-extension build ==="
if [ -f "$ROOT/package.json" ]; then
  echo "[npm build]"
  (cd "$ROOT" && npm ci --no-audit --no-fund)
  echo "  ✅ npm ci"
  (cd "$ROOT" && npm run build)
  echo "  ✅ npm run build"
else
  echo "  ℹ️  repository empty — no build target yet"
  echo "  📝 This repo will hold the Verstak browser extension (page capture)"
fi
echo ""
echo "✅ build passed (no-op)"
