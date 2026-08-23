#!/bin/sh
# Pre-commit hook — smart staged file detection + lint + tests
# Installed by: scripts/install-hooks.sh
#
# What it does:
#   1. Detects staged files (git diff --cached)
#   2. Lints ONLY changed files (ruff + eslint)
#   3. Runs ONLY tests for changed files (pytest + vitest)
#   4. Checks every changed source file has a test file
#   5. Validates Python imports in changed files
#
# Bypass: git commit --no-verify (NOT recommended)

PYTHON=${PYTHON:-python}
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo ""
echo "══════════════════════════════════════════════════"
echo "  PRE-COMMIT: Smart staged file check"
echo "══════════════════════════════════════════════════"

$PYTHON "$PROJECT_ROOT/scripts/pre-commit-check.py" --staged --quick
RESULT=$?

if [ $RESULT -ne 0 ]; then
    echo ""
    echo "  COMMIT BLOCKED — fix failures above."
    echo "  Bypass with: git commit --no-verify (NOT recommended)"
    echo ""
    exit 1
fi

echo ""
echo "  All checks passed — committing."
echo ""
exit 0
