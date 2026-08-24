@echo off
REM ============================================================
REM  Install git hooks: pre-commit + commit-msg
REM  Git hooks run via sh (git bash) even on Windows
REM  pre-commit: lint + tests + coverage gap + import validation
REM  commit-msg:  English only + conventional commits format
REM ============================================================
setlocal
set PROJECT_ROOT=%~dp0..\

if not exist "%PROJECT_ROOT%.git\hooks" (
    echo ERROR: .git\hooks not found. Run from git repository.
    exit /b 1
)

echo.
echo ============================================================
echo   INSTALLING GIT HOOKS
echo ============================================================
echo.

REM --- pre-commit hook (sh script — git runs hooks via sh) ---
copy /Y "%PROJECT_ROOT%scripts\pre-commit-hook-git.sh" "%PROJECT_ROOT%.git\hooks\pre-commit" >nul
if %errorlevel% neq 0 (
    echo ERROR: Failed to install pre-commit hook.
    exit /b 1
)
echo   [OK] pre-commit  — lint + tests + coverage gap + imports

REM --- commit-msg hook ---
copy /Y "%PROJECT_ROOT%scripts\commit-msg-hook-git.sh" "%PROJECT_ROOT%.git\hooks\commit-msg" >nul
if %errorlevel% neq 0 (
    echo ERROR: Failed to install commit-msg hook.
    exit /b 1
)
echo   [OK] commit-msg   — English only + conventional commits format

echo.
echo ============================================================
echo   HOOKS INSTALLED
echo ============================================================
echo.
echo   pre-commit runs (matches .github/workflows/ci.yml):
echo     LINT:
echo       1. ruff on staged Python files (exchange_simulator + ai-signal-bot)
echo       2. eslint on staged JS/JSX files (web-ui)
echo       3. clang-format on staged C++ files (hft-trade-bot)
echo     TESTS:
echo       4. pytest for changed Python source files
echo       5. vitest for changed JS/JSX source files
echo       6. cmake build + ctest for C++ (in --full/--all mode)
echo       7. cargo build + test for Rust (in --full/--all mode)
echo     BUILD:
echo       8. vite build for web-ui (in --full/--all mode)
echo     SECURITY:
echo       9. bandit scan on Python (in --full/--all mode)
echo      10. npm audit on web-ui (in --full/--all mode)
echo     E2E:
echo      11. playwright e2e tests (--all mode only)
echo     QUALITY:
echo      12. Coverage gap check (every source file needs a test)
echo      13. Python import validation (AST + module existence)
echo.
echo   commit-msg checks:
echo     1. No Cyrillic in commit message
echo     2. Conventional commits format (feat: / fix: / refactor: etc.)
echo     3. First line max 72 chars
echo.
echo   Bypass:    git commit --no-verify
echo   Auto-fix:  python scripts\pre-commit-check.py --fix
echo   Staged:    python scripts\pre-commit-check.py --staged --quick
echo   Full:      python scripts\pre-commit-check.py --full
echo   ALL CI:    python scripts\pre-commit-check.py --all
echo   Lint only: python scripts\pre-commit-check.py --lint
echo   Tests:     python scripts\pre-commit-check.py --tests
echo   Health:    python scripts\health-check.py
echo.
echo ============================================================
echo.
exit /b 0
