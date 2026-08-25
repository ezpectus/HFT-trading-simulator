#!/usr/bin/env bash
# CI Helm Lint — Validate all Helm charts
# Usage: ./scripts/ci/helm-lint.sh
# Exit code: 0 if all pass, 1 if any fail
set -euo pipefail

PASS=0
FAIL=0

echo "=========================================="
echo "  CI Helm Lint"
echo "=========================================="

CHARTS=("helm" "deploy/helm")

for chart in "${CHARTS[@]}"; do
  if [ -d "$chart" ]; then
    echo ""
    echo "[Helm] Linting $chart..."
    if helm lint "$chart" 2>&1; then
      echo "  ✅ $chart: LINT OK"
      PASS=$((PASS + 1))
    else
      echo "  ❌ $chart: LINT FAILED"
      FAIL=$((FAIL + 1))
    fi
  fi
done

# ── Template rendering check ──
for chart in "${CHARTS[@]}"; do
  if [ -d "$chart" ]; then
    echo ""
    echo "[Helm] Template render $chart..."
    if helm template test "$chart" >/dev/null 2>&1; then
      echo "  ✅ $chart: TEMPLATE OK"
      PASS=$((PASS + 1))
    else
      echo "  ❌ $chart: TEMPLATE FAILED"
      FAIL=$((FAIL + 1))
    fi
  fi
done

# ── Summary ──
echo ""
echo "=========================================="
echo "  Helm Lint Results: $PASS passed, $FAIL failed"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
