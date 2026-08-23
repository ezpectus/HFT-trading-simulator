@echo off
REM ============================================================
REM  Pre-commit hook — smart staged file detection + lint + tests
REM  Installed by: scripts\install-hooks.bat
REM
REM  What it does:
REM    1. Detects staged files (git diff --cached)
REM    2. Lints ONLY changed files (ruff + eslint)
REM    3. Runs ONLY tests for changed files (pytest + vitest)
REM    4. Checks every changed source file has a test file
REM    5. Validates Python imports in changed files
REM
REM  Bypass: git commit --no-verify (NOT recommended)
REM ============================================================

setlocal
set PROJECT_ROOT=%~dp0..\

echo.
echo ============================================================
echo   PRE-COMMIT: Smart staged file check
echo ============================================================

python "%PROJECT_ROOT%scripts\pre-commit-check.py" --staged --quick
if %errorlevel% neq 0 (
    echo.
    echo   COMMIT BLOCKED — fix failures above.
    echo   Bypass with: git commit --no-verify ^(NOT recommended^)
    echo.
    exit /b 1
)

echo.
echo   All checks passed — committing.
echo.
exit /b 0
