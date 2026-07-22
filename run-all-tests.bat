@echo off
setlocal enabledelayedexpansion
set ROOT=%~dp0

echo.
echo  ================================================
echo   CI Local Test Runner - 7 windows (23 CI jobs)
echo  ================================================
echo.
echo   Window 1: Python Lint (ruff) + Security (bandit)
echo   Window 2: Python Tests (pytest, both components)
echo   Window 3: JS Lint (eslint) + Audit (npm audit)
echo   Window 4: JS Tests (vitest) + E2E (playwright)
echo   Window 5: JS Build (vite) + Bundle size
echo   Window 6: Docker Build (all 4 services)
echo   Window 7: C++ Lint + Build + Tests (cmake/ctest)
echo.
echo  Opening windows...
echo.

REM --- Window 1: Python Lint + Bandit ---
start "CI: Python Lint+Security" cmd /k "echo === PYTHON LINT (ruff) === & cd /d %ROOT%exchange_simulator & python -m ruff check . 2>&1 & cd /d %ROOT%ai-signal-bot & python -m ruff check . 2>&1 & echo. & echo === BANDIT SECURITY === & cd /d %ROOT%exchange_simulator & python -m bandit -r . -ll -ii -q 2>&1 & cd /d %ROOT%ai-signal-bot & python -m bandit -r . -ll -ii -q 2>&1 & echo. & echo DONE & pause"

REM --- Window 2: Python Tests ---
start "CI: Python Tests" cmd /k "echo === PYTHON TESTS === & echo. & echo [exchange_simulator] & cd /d %ROOT%exchange_simulator & python -m pytest tests/ -v --tb=short 2>&1 & echo. & echo [ai-signal-bot] & cd /d %ROOT%ai-signal-bot & python -m pytest tests/ -v --tb=short 2>&1 & echo. & echo DONE & pause"

REM --- Window 3: JS Lint + Audit ---
start "CI: JS Lint+Audit" cmd /k "echo === JS LINT (eslint) === & cd /d %ROOT%web-ui & npx eslint src/ 2>&1 & echo. & echo === NPM AUDIT === & npm audit --audit-level=high 2>&1 & echo. & echo DONE & pause"

REM --- Window 4: JS Tests + E2E ---
start "CI: JS Tests+E2E" cmd /k "echo === VITEST === & cd /d %ROOT%web-ui & npm run test:run 2>&1 & echo. & echo === PLAYWRIGHT E2E === & npx playwright test --reporter=line 2>&1 & echo. & echo DONE & pause"

REM --- Window 5: JS Build ---
start "CI: JS Build" cmd /k "echo === JS BUILD (vite) === & cd /d %ROOT%web-ui & npm run build 2>&1 & echo. & echo === BUNDLE SIZE === & dir /s /-c dist\ 2>nul | findstr /R "File(s)" & echo. & echo DONE & pause"

REM --- Window 6: Docker Build (skip if Docker not running) ---
start "CI: Docker Build" cmd /k "docker info >nul 2>&1 && (echo === DOCKER BUILD === & echo. & echo [exchange_simulator] & cd /d %ROOT%exchange_simulator & docker build -t exchange_simulator:ci . 2>&1 & echo. & echo [ai-signal-bot] & cd /d %ROOT%ai-signal-bot & docker build -t ai-signal-bot:ci . 2>&1 & echo. & echo [hft-trade-bot] & cd /d %ROOT%hft-trade-bot & docker build -t hft-trade-bot:ci . 2>&1 & echo. & echo [web-ui] & cd /d %ROOT%web-ui & docker build -t web-ui:ci . 2>&1) || (echo === DOCKER BUILD === & echo. & echo Docker daemon not running, skipping Docker builds. & echo Start Docker Desktop to run this step.) & echo. & echo DONE & pause"

REM --- Window 7: C++ Lint + Build + Tests ---
start "CI: C++ Build+Tests" cmd /k "%ROOT%run-cpp-tests.bat"

echo.
echo  7 windows opened. Check each one for results.
echo  Close them manually when done.
echo.
pause
endlocal
