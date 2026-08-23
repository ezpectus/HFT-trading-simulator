#!/bin/sh
# Pre-commit hook — runs lint + tests before allowing commit.
# Installed by: scripts/install-hooks.sh (or manual copy to .git/hooks/pre-commit)
#
# If any check fails — commit is BLOCKED.
# Bypass with: git commit --no-verify (NOT recommended)

PYTHON=${PYTHON:-python}

echo ""
echo "══════════════════════════════════════════════════"
echo "  PRE-COMMIT: Running lint + tests..."
echo "══════════════════════════════════════════════════"

$PYTHON scripts/pre-commit-check.py --quick
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
