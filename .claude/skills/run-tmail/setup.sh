#!/usr/bin/env bash
# One-time (idempotent) setup for the run-tmail driver.
# Builds everything the driver needs without requiring sudo/root:
#   - frontend production build (frontend/dist)
#   - local playwright + chromium (already-shared cache if present)
#   - a local "sysroot" of the .so files headless Chromium needs that
#     this container's base image doesn't ship (no apt-get install,
#     no root: apt-get download + dpkg-deb -x into a private prefix)
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
CACHE="$SKILL_DIR/.cache"
mkdir -p "$CACHE/debs" "$CACHE/sysroot" "$CACHE/run"

echo "== frontend build =="
( cd "$REPO_ROOT/frontend" && npm install --no-audit --no-fund && npm run build )

echo "== playwright (local to skill dir) =="
( cd "$SKILL_DIR" && npm install --no-audit --no-fund && npx playwright install chromium )

echo "== chromium runtime libs (no sudo: apt-get download + dpkg-deb -x) =="
if [ ! -f "$CACHE/sysroot/usr/lib/x86_64-linux-gnu/libnss3.so" ]; then
  ( cd "$CACHE/debs" && apt-get download \
      libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 \
      libcairo2 libcups2t64 libgbm1 libnspr4 libnss3 libpango-1.0-0 \
      libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 )
  for f in "$CACHE"/debs/*.deb; do dpkg-deb -x "$f" "$CACHE/sysroot"; done
else
  echo "sysroot already built, skipping"
fi

echo "== dev config + fake mail-account state (isolated under .cache/run) =="
python3 "$SKILL_DIR/make_config.py" "$CACHE/run"

echo "== verify: launch chromium headless =="
LD_LIBRARY_PATH="$CACHE/sysroot/usr/lib/x86_64-linux-gnu" node "$SKILL_DIR/verify_chromium.mjs"

echo "== setup complete =="
