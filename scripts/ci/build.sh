#!/usr/bin/env bash
# CI Build Check — Build all Docker images
# Usage: ./scripts/ci/build.sh
# Exit code: 0 if all build, 1 if any fail
set -euo pipefail

PASS=0
FAIL=0

echo "=========================================="
echo "  CI Build Check — Docker Images"
echo "=========================================="

IMAGES=(
  "exchange-simulator:./exchange_simulator"
  "ai-signal-bot:./ai-signal-bot"
  "hft-trade-bot:./hft-trade-bot"
  "web-ui:./web-ui"
)

for entry in "${IMAGES[@]}"; do
  name="${entry%%:*}"
  context="${entry##*:}"
  echo ""
  echo "[Docker] Building $name..."
  if docker build -t "hft-$name:ci-test" "$context" 2>&1; then
    echo "  ✅ $name: BUILD OK"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name: BUILD FAILED"
    FAIL=$((FAIL + 1))
  fi
done

# ── Summary ──
echo ""
echo "=========================================="
echo "  Build Results: $PASS passed, $FAIL failed"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
