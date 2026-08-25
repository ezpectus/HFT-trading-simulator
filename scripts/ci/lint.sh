#!/usr/bin/env bash
# CI Lint Check — Python (ruff) + JavaScript (eslint)
# Usage: ./scripts/ci/lint.sh
# Exit code: 0 if all pass, 1 if any fail
set -euo pipefail

PASS=0
FAIL=0

echo "=========================================="
echo "  CI Lint Check"
echo "=========================================="

# ── Python (ruff) ──
echo ""
echo "[Python] Running ruff check..."
if command -v ruff &>/dev/null; then
  if ruff check ai-signal-bot/src/ exchange_simulator/ --line-length 120; then
    echo "  ✅ ruff: PASS"
    PASS=$((PASS + 1))
  else
    echo "  ❌ ruff: FAIL"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ⚠️  ruff not installed — skipping"
fi

# ── JavaScript (eslint) ──
echo ""
echo "[JavaScript] Running eslint..."
if [ -f web-ui/node_modules/.bin/eslint ]; then
  if (cd web-ui && npx eslint src/); then
    echo "  ✅ eslint: PASS"
    PASS=$((PASS + 1))
  else
    echo "  ❌ eslint: FAIL"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ⚠️  eslint not installed — run 'cd web-ui && npm install' first"
fi

# ── Summary ──
echo ""
echo "=========================================="
echo "  Lint Results: $PASS passed, $FAIL failed"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
