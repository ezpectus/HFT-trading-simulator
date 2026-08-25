#!/usr/bin/env bash
# CI Test Runner — Python (pytest) + JavaScript (vitest)
# Usage: ./scripts/ci/test.sh
# Exit code: 0 if all pass, 1 if any fail
set -euo pipefail

PASS=0
FAIL=0

echo "=========================================="
echo "  CI Test Runner"
echo "=========================================="

# ── Python (pytest) ──
echo ""
echo "[Python] Running pytest..."
if command -v pytest &>/dev/null; then
  if pytest ai-signal-bot/tests/ -v --tb=short 2>&1; then
    echo "  ✅ pytest: PASS"
    PASS=$((PASS + 1))
  else
    echo "  ❌ pytest: FAIL"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ⚠️  pytest not installed — run 'pip install pytest pytest-asyncio'"
fi

# ── JavaScript (vitest) ──
echo ""
echo "[JavaScript] Running vitest..."
if [ -f web-ui/node_modules/.bin/vitest ]; then
  if (cd web-ui && npx vitest run --reporter=verbose 2>&1); then
    echo "  ✅ vitest: PASS"
    PASS=$((PASS + 1))
  else
    echo "  ❌ vitest: FAIL"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ⚠️  vitest not installed — run 'cd web-ui && npm install'"
fi

# ── Summary ──
echo ""
echo "=========================================="
echo "  Test Results: $PASS passed, $FAIL failed"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
