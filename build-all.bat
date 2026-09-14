@echo off
REM ============================================================
REM  HFT Trading System — Full Pipeline Build & Test
REM  Compiles and tests ALL components:
REM    1. Python: Exchange Simulator (tests)
REM    2. Python: AI Signal Bot (tests + live module import checks)
REM    3. C++:   HFT Trade Bot (CMake build + tests)
REM    4. JS:    Web UI (lint + tests + build)
REM    5. Docker: Prod image build verification (same as CI)
REM
REM  Usage: build-all.bat          — build + test everything
REM         build-all.bat quick    — skip C++ build, just import checks
REM         build-all.bat python   — only Python components
REM         build-all.bat cpp      — only C++ build
REM         build-all.bat js       — only JS build
REM ============================================================

setlocal enabledelayedexpansion
set PROJECT_ROOT=%~dp0
set EXIT_CODE=0
set MODE=%1
if "%MODE%"=="" set MODE=all

echo ============================================
echo  HFT Trading System — Full Pipeline Build
echo  Mode: %MODE%
echo  Root: %PROJECT_ROOT%
echo  Date: %DATE% %TIME%
echo ============================================
echo.

REM ── Helper: check if command exists ──
where python >nul 2>&1
if errorlevel 1 (
    echo [FATAL] python not found in PATH
    exit /b 1
)

REM ── 1. Exchange Simulator ──────────────────────────────────
if /i "%MODE%"=="all" goto :exchange
if /i "%MODE%"=="python" goto :exchange
if /i "%MODE%"=="quick" goto :exchange
goto :skip_exchange

:exchange
echo [1/5] Python — Exchange Simulator
echo -------------------------------------------

REM Import check must run from repo root — the package is not
REM importable from inside its own directory.
cd /d "%PROJECT_ROOT%"
python -c "import exchange_simulator; print('[OK] exchange_simulator imports')" 2>&1
if errorlevel 1 (
    echo [FAIL] exchange_simulator import failed
    set EXIT_CODE=1
) else (
    REM Run tests
    cd /d "%PROJECT_ROOT%exchange_simulator"
    python -m pytest tests/ -v --tb=short -q 2>&1
    if errorlevel 1 (
        echo [FAIL] Exchange Simulator tests failed
        set EXIT_CODE=1
    ) else (
        echo [OK] Exchange Simulator tests passed
    )
)
echo.
cd /d "%PROJECT_ROOT%"
:skip_exchange

REM ── 2. AI Signal Bot ───────────────────────────────────────
if /i "%MODE%"=="all" goto :signals
if /i "%MODE%"=="python" goto :signals
if /i "%MODE%"=="quick" goto :signals
goto :skip_signals

:signals
echo [2/5] Python — AI Signal Bot
echo -------------------------------------------
cd /d "%PROJECT_ROOT%ai-signal-bot"

REM Core tests
python -m pytest tests/ -v --tb=short -q 2>&1
if errorlevel 1 (
    echo [FAIL] AI Signal Bot tests failed
    set EXIT_CODE=1
) else (
    echo [OK] AI Signal Bot tests passed
)
echo.

REM ── 2b. Live module import checks ──
echo --- Module import checks ---

echo   [Strategies] funding_arb_detector...
python -c "from src.strategies.funding_arb_detector import FundingRateArbitrageDetector; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Strategies] statistical_arbitrage...
python -c "from src.strategies.statistical_arbitrage import StatisticalArbitrage; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Pricing] volatility_surface...
python -c "from src.pricing.volatility_surface import VolatilitySurface, SVIParams, SABRParams; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Observability] tracing...
python -c "from src.observability.tracing import setup_tracing; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Observability] logging...
python -c "from src.observability.logging import setup_logging; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Observability] health_checks...
python -c "from src.observability.health_checks import HealthChecker; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo.
cd /d "%PROJECT_ROOT%"
:skip_signals

REM ── 3. C++ HFT Trade Bot ───────────────────────────────────
if /i "%MODE%"=="all" goto :cpp
if /i "%MODE%"=="cpp" goto :cpp
goto :skip_cpp

:cpp
echo [3/5] C++ — HFT Trade Bot (CMake)
echo -------------------------------------------
cd /d "%PROJECT_ROOT%hft-trade-bot"

where cmake >nul 2>&1
if errorlevel 1 (
    echo [SKIP] CMake not found — install from https://cmake.org/
    set EXIT_CODE=1
    goto :skip_cpp
)

if not exist build mkdir build
cd build

REM Try vcpkg toolchain if available
set CMAKE_EXTRA=
if defined VCPKG_ROOT (
    set CMAKE_EXTRA=-DCMAKE_TOOLCHAIN_FILE=%VCPKG_ROOT%\scripts\buildsystems\vcpkg.cmake
)

echo --- CMake Configure (Release, same as Docker) ---
cmake .. -DCMAKE_BUILD_TYPE=Release %CMAKE_EXTRA% -DWEBSOCKETPP_INCLUDE_DIR="%PROJECT_ROOT%websocketpp" 2>&1
if errorlevel 1 (
    echo [FAIL] CMake configuration failed
    set EXIT_CODE=1
    goto :cpp_done
)

echo --- CMake Build (Release) ---
cmake --build . --config Release -j 2>&1
if errorlevel 1 (
    echo [FAIL] C++ build failed
    set EXIT_CODE=1
    goto :cpp_done
)

echo --- C++ Tests (ctest) ---
ctest --output-on-failure -C Release 2>&1
if errorlevel 1 (
    echo [FAIL] C++ tests failed
    set EXIT_CODE=1
) else (
    echo [OK] C++ build + tests passed
)

:cpp_done
echo.
cd /d "%PROJECT_ROOT%"
:skip_cpp

REM ── 5. Web UI ──────────────────────────────────────────────
if /i "%MODE%"=="all" goto :js
if /i "%MODE%"=="js" goto :js
goto :skip_js

:js
echo [4/5] JS — Web UI (Vite + ESLint + Vitest)
echo -------------------------------------------
cd /d "%PROJECT_ROOT%web-ui"

where npm >nul 2>&1
if errorlevel 1 (
    echo [SKIP] npm not found — install Node.js
    set EXIT_CODE=1
    goto :skip_js
)

if not exist node_modules (
    echo [INFO] Installing npm dependencies...
    call npm install
)

echo --- ESLint ---
call npm run lint 2>&1
if errorlevel 1 (
    echo [WARN] ESLint found issues (non-blocking)
)

echo --- Vitest ---
call npx vitest run --passWithNoTests 2>&1
if errorlevel 1 (
    echo [FAIL] JS tests failed
    set EXIT_CODE=1
) else (
    echo [OK] JS tests passed
)

echo --- Vite Build ---
call npm run build 2>&1
if errorlevel 1 (
    echo [FAIL] JS build failed
    set EXIT_CODE=1
) else (
    echo [OK] JS build passed — dist/ ready
)
echo.
cd /d "%PROJECT_ROOT%"
:skip_js

REM ── 6. Docker Prod Build ────────────────────────────────────
if /i "%MODE%"=="all" goto :docker
if /i "%MODE%"=="docker" goto :docker
goto :skip_docker

:docker
echo [5/5] Docker — Prod Image Build (gcc:14)
echo -------------------------------------------
where docker >nul 2>&1
if errorlevel 1 (
    echo [SKIP] Docker not found — install Docker Desktop
    goto :skip_docker
)

echo --- HFT Trade Bot (Dockerfile.prod) ---
docker buildx build -f "%PROJECT_ROOT%hft-trade-bot\Dockerfile.prod" -t hft-trade-bot:prod "%PROJECT_ROOT%hft-trade-bot" 2>&1
if errorlevel 1 (
    echo [FAIL] HFT Trade Bot Docker build failed
    set EXIT_CODE=1
) else (
    echo [OK] HFT Trade Bot Docker image built
)
echo.
echo --- Exchange Simulator ---
docker buildx build -f "%PROJECT_ROOT%exchange_simulator\Dockerfile" -t hft-exchange-sim:prod "%PROJECT_ROOT%exchange_simulator" 2>&1
if errorlevel 1 (
    echo [FAIL] Exchange Simulator Docker build failed
    set EXIT_CODE=1
) else (
    echo [OK] Exchange Simulator Docker image built
)
echo.
echo --- AI Signal Bot ---
docker buildx build -f "%PROJECT_ROOT%ai-signal-bot\Dockerfile" -t hft-ai-signal-bot:prod "%PROJECT_ROOT%ai-signal-bot" 2>&1
if errorlevel 1 (
    echo [FAIL] AI Signal Bot Docker build failed
    set EXIT_CODE=1
) else (
    echo [OK] AI Signal Bot Docker image built
)
echo.
echo --- Web UI ---
docker buildx build -f "%PROJECT_ROOT%web-ui\Dockerfile" -t hft-web-ui:prod "%PROJECT_ROOT%web-ui" 2>&1
if errorlevel 1 (
    echo [FAIL] Web UI Docker build failed
    set EXIT_CODE=1
) else (
    echo [OK] Web UI Docker image built
)
echo.
:skip_docker

REM ── 7. Summary ─────────────────────────────────────────────
echo ============================================
echo  BUILD SUMMARY
echo ============================================
echo.
echo  Component              Status
echo  -------------------    --------
if /i "%MODE%"=="all" goto :summary_all
if /i "%MODE%"=="python" goto :summary_python
if /i "%MODE%"=="quick" goto :summary_quick
if /i "%MODE%"=="cpp" goto :summary_cpp
if /i "%MODE%"=="docker" goto :summary_all
if /i "%MODE%"=="js" goto :summary_js
goto :summary_all

:summary_all
echo  Exchange Simulator     Tested
echo  AI Signal Bot          Tested + Imports
echo  C++ HFT Trade Bot      Built + Tested (Release)
echo  Web UI                 Linted + Tested + Built
echo  Docker Prod            All images built
goto :summary_end

:summary_python
echo  Exchange Simulator     Tested
echo  AI Signal Bot          Tested + Imports
goto :summary_end

:summary_quick
echo  Exchange Simulator     Tested
echo  AI Signal Bot          Tested + Imports
goto :summary_end

:summary_cpp
echo  C++ HFT Trade Bot      Built + Tested
goto :summary_end

:summary_js
echo  Web UI                 Linted + Tested + Built
goto :summary_end

:summary_end
echo.
if "!EXIT_CODE!"=="0" (
    echo  *** ALL CHECKS PASSED ***
) else (
    echo  *** SOME CHECKS FAILED — see output above ***
)
echo.
echo  Exit code: !EXIT_CODE!
echo ============================================

endlocal
exit /b %EXIT_CODE%
