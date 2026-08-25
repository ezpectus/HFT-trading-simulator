#!/usr/bin/env bash
# CI Security Scan — npm audit, pip-audit, gitleaks, hardcoded secrets
# Usage: ./scripts/ci/security.sh
# Exit code: 0 if all pass, 1 if any critical findings
set -euo pipefail

PASS=0
FAIL=0
WARN=0

echo "=========================================="
echo "  CI Security Scan"
echo "=========================================="

# ── npm audit ──
echo ""
echo "[npm] Running npm audit..."
if [ -f web-ui/package-lock.json ] || [ -f web-ui/yarn.lock ]; then
  if (cd web-ui && npm audit --audit-level=high 2>&1); then
    echo "  ✅ npm audit: No high/critical vulnerabilities"
    PASS=$((PASS + 1))
  else
    echo "  ❌ npm audit: Vulnerabilities found"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ⚠️  No lockfile found — skipping npm audit"
fi

# ── pip-audit ──
echo ""
echo "[Python] Running pip-audit..."
if command -v pip-audit &>/dev/null; then
  if pip-audit -r ai-signal-bot/requirements.txt 2>&1; then
    echo "  ✅ pip-audit: No known vulnerabilities"
    PASS=$((PASS + 1))
  else
    echo "  ❌ pip-audit: Vulnerabilities found"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ⚠️  pip-audit not installed — run 'pip install pip-audit'"
fi

# ── gitleaks ──
echo ""
echo "[Git] Running gitleaks..."
if command -v gitleaks &>/dev/null; then
  if gitleaks detect --source . --no-banner 2>&1; then
    echo "  ✅ gitleaks: No secrets detected"
    PASS=$((PASS + 1))
  else
    echo "  ❌ gitleaks: Potential secrets found"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ⚠️  gitleaks not installed — see https://github.com/gitleaks/gitleaks"
fi

# ── Hardcoded secrets check ──
echo ""
echo "[Code] Checking for hardcoded secrets..."
SECRET_PATTERNS="(api_key|api_secret|password|token)\s*[:=]\s*['\"][^'\"]{8,}['\"]"
if ! grep -rEni "$SECRET_PATTERNS" --include='*.py' --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=vcpkg \
  ai-signal-bot/src/ exchange_simulator/ web-ui/src/ hft-trade-bot/src/ 2>/dev/null | grep -v -E "(test|mock|example|placeholder|changeme|your_|\\$\\{|env|getenv|os\\.environ)"; then
  echo "  ✅ No hardcoded secrets found"
  PASS=$((PASS + 1))
else
  echo "  ⚠️  Potential hardcoded secrets — review manually"
  WARN=$((WARN + 1))
fi

# ── Summary ──
echo ""
echo "=========================================="
echo "  Security Results: $PASS passed, $WARN warnings, $FAIL failed"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
