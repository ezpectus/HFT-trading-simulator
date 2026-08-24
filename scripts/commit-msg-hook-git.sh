#!/bin/sh
# Git commit-msg hook — works on Windows (git bash) AND Linux/macOS
# Installed by: scripts/install-hooks.bat or scripts/install-hooks.sh
#
# Bypass: git commit --no-verify (NOT recommended)

# Find Python
PYTHON=""
for cmd in python3 python py; do
    if command -v "$cmd" >/dev/null 2>&1; then
        PYTHON="$cmd"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    exit 0
fi

PROJECT_ROOT="$(git rev-parse --show-toplevel)"

"$PYTHON" "$PROJECT_ROOT/scripts/pre-commit-check.py" --msg-file "$1"
RESULT=$?

if [ $RESULT -ne 0 ]; then
    echo ""
    echo "  COMMIT MESSAGE REJECTED — fix issues above."
    echo "  Bypass with: git commit --no-verify (NOT recommended)"
    echo ""
    exit 1
fi

exit 0
