@echo off
REM ============================================================
REM  Install pre-commit hook for Windows
REM  Copies pre-commit-hook.bat to .git\hooks\pre-commit
REM ============================================================
setlocal
set PROJECT_ROOT=%~dp0..\

if not exist "%PROJECT_ROOT%.git\hooks" (
    echo ERROR: .git\hooks not found. Run from git repository.
    exit /b 1
)

copy /Y "%PROJECT_ROOT%scripts\pre-commit-hook.bat" "%PROJECT_ROOT%.git\hooks\pre-commit" >nul
if %errorlevel% neq 0 (
    echo ERROR: Failed to copy hook.
    exit /b 1
)

echo.
echo ============================================================
echo   PRE-COMMIT HOOK INSTALLED
echo ============================================================
echo.
echo   Hook: .git\hooks\pre-commit
echo   Runs: lint (ruff + eslint) + tests (pytest + vitest)
echo   Mode: --quick (stop on first failure)
echo.
echo   Bypass: git commit --no-verify
echo   Full:   python scripts\pre-commit-check.py
echo   Lint:   python scripts\pre-commit-check.py --lint
echo   Tests:  python scripts\pre-commit-check.py --tests
echo.
echo ============================================================
echo.
exit /b 0
