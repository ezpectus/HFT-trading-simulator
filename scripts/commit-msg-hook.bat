@echo off
REM ============================================================
REM  Commit-msg hook — validates commit message format
REM  Checks: English only, conventional commits format, max 72 chars
REM  Installed by: scripts\install-hooks.bat
REM ============================================================

setlocal
set PROJECT_ROOT=%~dp0..\
set MSG_FILE=%1

python "%PROJECT_ROOT%scripts\pre-commit-check.py" --msg-file "%MSG_FILE%"
if %errorlevel% neq 0 (
    echo.
    echo   COMMIT MESSAGE REJECTED — fix issues above.
    echo   Bypass with: git commit --no-verify ^(NOT recommended^)
    echo.
    exit /b 1
)

exit /b 0
