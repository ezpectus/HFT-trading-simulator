#!/usr/bin/env bash
# CI Orchestrator — Run all checks in sequence
# Usage: ./scripts/ci/run-all.sh [--skip-build] [--skip-scan]
# Exit code: 0 if all pass, 1 if any fail
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0
SKIP_BUILD=false
SKIP_SCAN=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --skip-scan)  SKIP_SCAN=true ;;
  esac
done

echo "=========================================="
echo "  CI Full Run — All Checks"
echo "=========================================="
echo ""

run_check() {
  local name="$1"
  local script="$2"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Running: $name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if bash "$script"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
  echo ""
}

run_check "Lint"      "$SCRIPT_DIR/lint.sh"
run_check "Tests"     "$SCRIPT_DIR/test.sh"
run_check "Helm Lint" "$SCRIPT_DIR/helm-lint.sh"
run_check "Security"  "$SCRIPT_DIR/security.sh"

if [ "$SKIP_BUILD" = "false" ]; then
  run_check "Build" "$SCRIPT_DIR/build.sh"
  if [ "$SKIP_SCAN" = "false" ]; then
    run_check "Image Scan" "$SCRIPT_DIR/scan-images.sh"
  fi
fi

# ── Summary ──
echo "=========================================="
echo "  CI Full Run Results"
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
