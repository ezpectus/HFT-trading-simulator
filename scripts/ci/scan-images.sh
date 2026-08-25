#!/usr/bin/env bash
# CI Docker Image Scan — Scan built images with trivy or grype
# Usage: ./scripts/ci/scan-images.sh
# Exit code: 0 if no critical findings, 1 if critical vulnerabilities found
set -euo pipefail

PASS=0
FAIL=0

echo "=========================================="
echo "  CI Docker Image Scan"
echo "=========================================="

IMAGES=("hft-exchange-simulator:ci-test" "hft-ai-signal-bot:ci-test" "hft-hft-trade-bot:ci-test" "hft-web-ui:ci-test")

SCANNER=""
if command -v trivy &>/dev/null; then
  SCANNER="trivy"
elif command -v grype &>/dev/null; then
  SCANNER="grype"
else
  echo "  ⚠️  Neither trivy nor grype installed"
  echo "  Install one of:"
  echo "    trivy: https://aquasecurity.github.io/trivy/"
  echo "    grype: https://github.com/anchore/grype"
  exit 0
fi

for image in "${IMAGES[@]}"; do
  echo ""
  echo "[$SCANNER] Scanning $image..."
  if ! docker image inspect "$image" &>/dev/null; then
    echo "  ⚠️  Image $image not found — run build.sh first"
    continue
  fi

  if [ "$SCANNER" = "trivy" ]; then
    if trivy image --severity CRITICAL --exit-code 1 "$image" 2>&1; then
      echo "  ✅ $image: No critical vulnerabilities"
      PASS=$((PASS + 1))
    else
      echo "  ❌ $image: Critical vulnerabilities found"
      FAIL=$((FAIL + 1))
    fi
  else
    if grype "$image" --fail-on=high 2>&1; then
      echo "  ✅ $image: No high+ vulnerabilities"
      PASS=$((PASS + 1))
    else
      echo "  ❌ $image: Vulnerabilities found"
      FAIL=$((FAIL + 1))
    fi
  fi
done

# ── Summary ──
echo ""
echo "=========================================="
echo "  Scan Results: $PASS passed, $FAIL failed"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
