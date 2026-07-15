@echo off
REM ============================================================
REM  HFT Trading System — Full Pipeline Build & Test
REM  Compiles and tests ALL components:
REM    1. Python: Exchange Simulator (tests)
REM    2. Python: AI Signal Bot (tests + new module imports)
REM    3. C++:   HFT Trade Bot (CMake build + tests)
REM    4. Rust:  HFT Executor (cargo build)
REM    5. JS:    Web UI (lint + tests + build)
REM    6. Python: New modules import check (ML, risk, research, pricing)
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
echo [1/6] Python — Exchange Simulator
echo -------------------------------------------
cd /d "%PROJECT_ROOT%exchange_simulator"

REM Check imports
python -c "import exchange_simulator; print('[OK] exchange_simulator imports')" 2>&1
if errorlevel 1 (
    echo [FAIL] exchange_simulator import failed
    set EXIT_CODE=1
) else (
    REM Run tests
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
echo [2/6] Python — AI Signal Bot
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

REM ── 2b. New module import checks ──
echo --- New module import checks ---

echo   [ML] price_predictor...
python -c "from src.ml.price_predictor import LSTMPredictor, TransformerPredictor, ModelConfig; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [ML] rl_trader...
python -c "from src.ml.rl_trader import PPOAgent, DQNAgent, RLConfig; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [ML] automl...
python -c "from src.ml.automl import AutoMLOptimizer, AutoMLConfig; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [ML] model_registry...
python -c "from src.ml.model_registry import ModelRegistry, ModelStatus; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [ML] feature_store...
python -c "from src.ml.feature_store import FeatureStore; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [ML] onnx_engine (C++ header check)...
if exist "%PROJECT_ROOT%hft-trade-bot\src\ml\onnx_engine.h" (
    echo    [OK]
) else (
    echo    [FAIL] onnx_engine.h not found
    set EXIT_CODE=1
)

echo   [Strategies] cross_exchange_arb...
python -c "from src.strategies.cross_exchange_arb import CrossExchangeArbEngine; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Strategies] portfolio_optimizer...
python -c "from src.strategies.portfolio_optimizer import PortfolioOptimizer; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Strategies] marketplace...
python -c "from src.strategies.marketplace import StrategyMarketplace; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Risk] var_stress_test...
python -c "from src.risk.var_stress_test import RiskAnalyzer, STRESS_SCENARIOS; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Pricing] volatility_surface...
python -c "from src.pricing.volatility_surface import VolatilitySurface, SVIParams, SABRParams; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Data] market_replay...
python -c "from src.data_collection.market_replay import MarketReplay; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Data] timescaledb_client...
python -c "from src.data_collection.timescaledb_client import TimescaleDBClient; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Observability] tracing...
python -c "from src.observability.tracing import init_tracing; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Observability] logging...
python -c "from src.observability.logging import setup_logging; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Observability] health_checks...
python -c "from src.observability.health_checks import HealthChecker; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Networking] dpdk_transport...
python -c "from src.networking.dpdk_transport import DPDKTransport; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Research] genetic_strategy...
python -c "from src.research.genetic_strategy import GeneticStrategyDiscovery; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Research] competition...
python -c "from src.research.competition import StrategyCompetition; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Research] microstructure_lab...
python -c "from src.research.microstructure_lab import MicrostructureLab; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Research] attribution...
python -c "from src.research.attribution import BrinsonFachler; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo   [Research] greeks_hedging...
python -c "from src.research.greeks_hedging import GreeksHedgingSimulator; print('    [OK]')" 2>&1
if errorlevel 1 ( echo    [FAIL] & set EXIT_CODE=1 )

echo.
cd /d "%PROJECT_ROOT%"
:skip_signals

REM ── 3. C++ HFT Trade Bot ───────────────────────────────────
if /i "%MODE%"=="all" goto :cpp
if /i "%MODE%"=="cpp" goto :cpp
goto :skip_cpp

:cpp
echo [3/6] C++ — HFT Trade Bot (CMake)
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

echo --- CMake Configure ---
cmake .. -DCMAKE_BUILD_TYPE=Debug %CMAKE_EXTRA% -DWEBSOCKETPP_INCLUDE_DIR="%PROJECT_ROOT%websocketpp" 2>&1
if errorlevel 1 (
    echo [FAIL] CMake configuration failed
    set EXIT_CODE=1
    goto :cpp_done
)

echo --- CMake Build ---
cmake --build . --config Debug -j 2>&1
if errorlevel 1 (
    echo [FAIL] C++ build failed
    set EXIT_CODE=1
    goto :cpp_done
)

echo --- C++ Tests (ctest) ---
ctest --output-on-failure -C Debug 2>&1
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

REM ── 4. Rust HFT Executor ───────────────────────────────────
if /i "%MODE%"=="all" goto :rust
if /i "%MODE%"=="cpp" goto :rust
goto :skip_rust

:rust
echo [4/6] Rust — HFT Executor (Cargo)
echo -------------------------------------------
cd /d "%PROJECT_ROOT%hft-executor"

where cargo >nul 2>&1
if errorlevel 1 (
    echo [SKIP] Rust/Cargo not found — install from https://rustup.rs/
    goto :skip_rust
)

cargo build --release 2>&1
if errorlevel 1 (
    echo [FAIL] Rust build failed
    set EXIT_CODE=1
) else (
    echo [OK] Rust executor built
    REM Try cargo test if tests exist
    cargo test --release 2>&1
    if errorlevel 1 (
        echo [WARN] Rust tests failed or no tests found
    ) else (
        echo [OK] Rust tests passed
    )
)
echo.
cd /d "%PROJECT_ROOT%"
:skip_rust

REM ── 5. Web UI ──────────────────────────────────────────────
if /i "%MODE%"=="all" goto :js
if /i "%MODE%"=="js" goto :js
goto :skip_js

:js
echo [5/6] JS — Web UI (Vite + ESLint + Vitest)
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

REM ── 6. Summary ─────────────────────────────────────────────
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
if /i "%MODE%"=="js" goto :summary_js
goto :summary_all

:summary_all
echo  Exchange Simulator     Tested
echo  AI Signal Bot          Tested + Imports
echo  C++ HFT Trade Bot      Built + Tested
echo  Rust Executor          Built
echo  Web UI                 Linted + Tested + Built
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
echo  Rust Executor          Built
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
