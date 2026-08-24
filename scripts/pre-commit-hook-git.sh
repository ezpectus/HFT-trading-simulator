#!/bin/sh
# Git pre-commit hook — works on Windows (git bash) AND Linux/macOS
# Installed by: scripts/install-hooks.bat or scripts/install-hooks.sh
#
# Bypass: git commit --no-verify (NOT recommended)

# Find Python: prefer python3, fallback to python
PYTHON=""
for cmd in python3 python py; do
    if command -v "$cmd" >/dev/null 2>&1; then
        PYTHON="$cmd"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    echo "PRE-COMMIT: Python not found — skipping checks."
    echo "  Install Python or use: git commit --no-verify"
    exit 0
fi

# Find project root (git rev-parse gives absolute path)
PROJECT_ROOT="$(git rev-parse --show-toplevel)"

echo ""
echo "============================================================"
echo "  PRE-COMMIT: Smart staged file check"
echo "============================================================"

"$PYTHON" "$PROJECT_ROOT/scripts/pre-commit-check.py" --staged --quick
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
