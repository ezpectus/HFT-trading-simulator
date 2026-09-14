#!/bin/sh
# ============================================================
#  Install git hooks: pre-commit + commit-msg
#  POSIX twin of install-hooks.bat — hooks run via sh.
#  pre-commit: lint + tests + coverage gap + import validation
#  commit-msg:  English only + conventional commits format
# ============================================================
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -d "$PROJECT_ROOT/.git/hooks" ]; then
    echo "ERROR: .git/hooks not found. Run from a git repository."
    exit 1
fi

echo
echo "============================================================"
echo "  INSTALLING GIT HOOKS"
echo "============================================================"
echo

cp "$PROJECT_ROOT/scripts/pre-commit-hook-git.sh" "$PROJECT_ROOT/.git/hooks/pre-commit"
chmod +x "$PROJECT_ROOT/.git/hooks/pre-commit"
echo "  [OK] pre-commit  — lint + tests + coverage gap + imports"

cp "$PROJECT_ROOT/scripts/commit-msg-hook-git.sh" "$PROJECT_ROOT/.git/hooks/commit-msg"
chmod +x "$PROJECT_ROOT/.git/hooks/commit-msg"
echo "  [OK] commit-msg   — English only + conventional commits format"

echo
echo "============================================================"
echo "  HOOKS INSTALLED"
echo "============================================================"
echo
echo "  The pre-commit hook runs on staged files:"
echo "    LINT:"
echo "      1. ruff on staged Python files (exchange_simulator + ai-signal-bot)"
echo "      2. eslint on staged JS/JSX files (web-ui)"
echo "      3. clang-format on staged C++ files (hft-trade-bot)"
echo "    TESTS:"
echo "      4. pytest for changed Python source files"
echo "      5. vitest for changed JS/JSX source files"
echo "      6. cmake build + ctest for C++ (in --tests/--full/--all mode)"
echo "    BUILD:"
echo "      7. vite build for web-ui (in --full/--all mode)"
echo "    SECURITY:"
echo "      8. bandit scan on Python (in --full/--all mode)"
echo
echo "  Manual: python scripts/pre-commit-check.py --staged"
echo "  Bypass: git commit --no-verify (NOT recommended)"
echo
