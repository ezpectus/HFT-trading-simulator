#!/bin/sh
# Commit-msg hook — validates commit message is English + conventional commits
# Installed by: scripts/install-hooks.sh
#
# Bypass: git commit --no-verify (NOT recommended)

PYTHON=${PYTHON:-python}
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

$PYTHON "$PROJECT_ROOT/scripts/pre-commit-check.py" --msg-file "$1"
RESULT=$?

if [ $RESULT -ne 0 ]; then
    echo ""
    echo "  COMMIT MESSAGE REJECTED — fix issues above."
    echo "  Bypass with: git commit --no-verify (NOT recommended)"
    echo ""
    exit 1
fi

exit 0
