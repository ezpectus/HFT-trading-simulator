@echo off
REM ============================================================
REM  Pre-commit hook for Windows — runs lint + tests before commit.
REM  Installed by: scripts\install-hooks.bat
REM
REM  If any check fails — commit is BLOCKED.
REM  Bypass with: git commit --no-verify (NOT recommended)
REM ============================================================

setlocal
set PROJECT_ROOT=%~dp0..\

echo.
echo ============================================================
echo   PRE-COMMIT: Running lint + tests...
echo ============================================================

python "%PROJECT_ROOT%scripts\pre-commit-check.py" --quick
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
