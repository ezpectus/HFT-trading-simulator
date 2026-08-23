@echo off
REM ============================================================
REM  Install git hooks: pre-commit + commit-msg
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

REM --- pre-commit hook ---
copy /Y "%PROJECT_ROOT%scripts\pre-commit-hook.bat" "%PROJECT_ROOT%.git\hooks\pre-commit" >nul
if %errorlevel% neq 0 (
    echo ERROR: Failed to install pre-commit hook.
    exit /b 1
)
echo   [OK] pre-commit  — lint + tests + coverage gap + imports

REM --- commit-msg hook ---
copy /Y "%PROJECT_ROOT%scripts\commit-msg-hook.bat" "%PROJECT_ROOT%.git\hooks\commit-msg" >nul
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
echo   pre-commit runs:
echo     1. ruff lint on staged Python files
echo     2. eslint on staged JS/JSX files
echo     3. pytest for changed source files only
echo     4. vitest for changed source files only
echo     5. Coverage gap check (every source file needs a test)
echo     6. Python import validation (no broken from X import Y)
echo.
echo   commit-msg checks:
echo     1. No Cyrillic in commit message
echo     2. Conventional commits format (feat: / fix: / refactor: etc.)
echo     3. First line max 72 chars
echo.
echo   Bypass:    git commit --no-verify
echo   Full:      python scripts\pre-commit-check.py
echo   Lint only: python scripts\pre-commit-check.py --lint
echo   Tests:     python scripts\pre-commit-check.py --tests
echo   Staged:    python scripts\pre-commit-check.py --staged
echo.
echo ============================================================
echo.
exit /b 0
