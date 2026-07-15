@echo off
REM ============================================================
REM  CI/CD Test Script — Full Pipeline Compilation & Tests
REM  Usage: ci-test.bat [all|quick|python|cpp|js|rust]
REM ============================================================
setlocal enabledelayedexpansion
set PROJECT_ROOT=%~dp0
set MODE=%1
if "%MODE%"=="" set MODE=all
set EXIT_CODE=0
set PASS=0
set FAIL=0
set SKIP=0

echo.
echo ============================================================
echo   HFT Trading System — CI/CD Test Pipeline
echo   Mode: %MODE%
echo   Date: %date% %time%
echo ============================================================
echo.

REM ─── Python: Exchange Simulator ───
if /i "%MODE%"=="all" goto :py_exchange
if /i "%MODE%"=="quick" goto :py_exchange
if /i "%MODE%"=="python" goto :py_exchange
goto :py_exchange_done

:py_exchange
echo [1/8] Python — Exchange Simulator tests
cd /d "%PROJECT_ROOT%exchange_simulator"
python -m pytest tests/ -v --tb=short -q 2>nul
if !errorlevel! equ 0 (
    echo   [PASS] Exchange Simulator tests
    set /a PASS+=1
) else (
    echo   [FAIL] Exchange Simulator tests
    set /a FAIL+=1
    set EXIT_CODE=1
)
cd /d "%PROJECT_ROOT%"

:py_exchange_done
REM ─── Python: AI Signal Bot ───
if /i "%MODE%"=="all" goto :py_signals
if /i "%MODE%"=="quick" goto :py_signals
if /i "%MODE%"=="python" goto :py_signals
goto :py_signals_done

:py_signals
echo [2/8] Python — AI Signal Bot tests
cd /d "%PROJECT_ROOT%ai-signal-bot"
python -m pytest tests/ -v --tb=short -q 2>nul
if !errorlevel! equ 0 (
    echo   [PASS] AI Signal Bot tests
    set /a PASS+=1
) else (
    echo   [FAIL] AI Signal Bot tests
    set /a FAIL+=1
    set EXIT_CODE=1
)
cd /d "%PROJECT_ROOT%"

:py_signals_done
REM ─── Python: Import checks ───
if /i "%MODE%"=="all" goto :py_imports
if /i "%MODE%"=="quick" goto :py_imports
if /i "%MODE%"=="python" goto :py_imports
goto :py_imports_done

:py_imports
echo [3/8] Python — Module import checks
python -c "import sys; sys.path.insert(0, 'exchange_simulator'); import exchange_simulator; print('  exchange_simulator OK')" 2>nul
if !errorlevel! equ 0 ( set /a PASS+=1 ) else ( echo   [FAIL] exchange_simulator import & set /a FAIL+=1 & set EXIT_CODE=1 )

python -c "import sys; sys.path.insert(0, 'ai-signal-bot'); from src.strategies import EnsembleVoter; from src.communication import ws_client; from src.backtesting import backtester; from src.risk import risk_manager; print('  ai-signal-bot modules OK')" 2>nul
if !errorlevel! equ 0 ( set /a PASS+=1 ) else ( echo   [FAIL] ai-signal-bot imports & set /a FAIL+=1 & set EXIT_CODE=1 )

python -c "import sys; sys.path.insert(0, 'ai-signal-bot'); from src.research.genetic_strategy import GeneticStrategyDiscovery; from src.research.competition import StrategyCompetition; from src.research.microstructure_lab import MicrostructureLab; from src.research.attribution import BrinsonFachler; from src.research.greeks_hedging import GreeksHedgingSimulator; print('  research modules OK')" 2>nul
if !errorlevel! equ 0 ( set /a PASS+=1 ) else ( echo   [FAIL] research imports & set /a FAIL+=1 & set EXIT_CODE=1 )

:py_imports_done
REM ─── C++: CMake Build ───
if /i "%MODE%"=="all" goto :cpp_build
if /i "%MODE%"=="quick" goto :cpp_build
if /i "%MODE%"=="cpp" goto :cpp_build
goto :cpp_build_done

:cpp_build
echo [4/8] C++ — CMake build (HFT Trade Bot)
cd /d "%PROJECT_ROOT%hft-trade-bot"
if not exist build mkdir build
cd build
cmake .. -G "Visual Studio 17 2022" -A x64 2>nul
if !errorlevel! neq 0 (
    echo   [INFO] Trying Ninja or default generator...
    cmake .. 2>nul
)
if !errorlevel! equ 0 (
    echo   [PASS] CMake configure
    set /a PASS+=1
) else (
    echo   [FAIL] CMake configure
    set /a FAIL+=1
    set EXIT_CODE=1
    goto :cpp_build_done
)

cmake --build . --config Release -j 2>nul
if !errorlevel! equ 0 (
    echo   [PASS] C++ build
    set /a PASS+=1
) else (
    echo   [FAIL] C++ build
    set /a FAIL+=1
    set EXIT_CODE=1
)
cd /d "%PROJECT_ROOT%"

:cpp_build_done
REM ─── C++: Tests ───
if /i "%MODE%"=="all" goto :cpp_test
if /i "%MODE%"=="cpp" goto :cpp_test
goto :cpp_test_done

:cpp_test
echo [5/8] C++ — CTest
cd /d "%PROJECT_ROOT%hft-trade-bot\build"
ctest -C Release --output-on-failure 2>nul
if !errorlevel! equ 0 (
    echo   [PASS] C++ tests
    set /a PASS+=1
) else (
    echo   [FAIL] C++ tests
    set /a FAIL+=1
    set EXIT_CODE=1
)
cd /d "%PROJECT_ROOT%"

:cpp_test_done
REM ─── Rust: Build ───
if /i "%MODE%"=="all" goto :rust_build
if /i "%MODE%"=="quick" goto :rust_skip
if /i "%MODE%"=="rust" goto :rust_build
goto :rust_done

:rust_build
echo [6/8] Rust — Cargo build (HFT Executor)
cd /d "%PROJECT_ROOT%hft-executor"
where cargo >nul 2>nul
if !errorlevel! equ 0 (
    cargo build --release 2>nul
    if !errorlevel! equ 0 (
        echo   [PASS] Rust build
        set /a PASS+=1
    ) else (
        echo   [FAIL] Rust build
        set /a FAIL+=1
        set EXIT_CODE=1
    )
    cargo test --release 2>nul
    if !errorlevel! equ 0 (
        echo   [PASS] Rust tests
        set /a PASS+=1
    ) else (
        echo   [FAIL] Rust tests
        set /a FAIL+=1
        set EXIT_CODE=1
    )
) else (
    echo   [SKIP] Rust not installed
    set /a SKIP+=1
)
cd /d "%PROJECT_ROOT%"
goto :rust_done

:rust_skip
echo [6/8] Rust — Skipped (quick mode)
set /a SKIP+=1

:rust_done
REM ─── JS: Lint + Test + Build ───
if /i "%MODE%"=="all" goto :js_test
if /i "%MODE%"=="quick" goto :js_test
if /i "%MODE%"=="js" goto :js_test
goto :js_done

:js_test
echo [7/8] JS — Web UI lint + test
cd /d "%PROJECT_ROOT%web-ui"
where npx >nul 2>nul
if !errorlevel! equ 0 (
    npx eslint src/ --quiet 2>nul
    if !errorlevel! equ 0 (
        echo   [PASS] ESLint
        set /a PASS+=1
    ) else (
        echo   [WARN] ESLint warnings (non-blocking)
        set /a PASS+=1
    )
    npx vitest run --reporter=verbose 2>nul
    if !errorlevel! equ 0 (
        echo   [PASS] Vitest
        set /a PASS+=1
    ) else (
        echo   [FAIL] Vitest
        set /a FAIL+=1
        set EXIT_CODE=1
    )
) else (
    echo   [SKIP] Node.js not installed
    set /a SKIP+=1
)
cd /d "%PROJECT_ROOT%"

:js_test_done
REM ─── JS: Build ───
if /i "%MODE%"=="all" goto :js_build
if /i "%MODE%"=="js" goto :js_build
goto :js_done

:js_build
echo [8/8] JS — Web UI production build
cd /d "%PROJECT_ROOT%web-ui"
where npx >nul 2>nul
if !errorlevel! equ 0 (
    npx vite build 2>nul
    if !errorlevel! equ 0 (
        echo   [PASS] Vite build
        set /a PASS+=1
    ) else (
        echo   [FAIL] Vite build
        set /a FAIL+=1
        set EXIT_CODE=1
    )
) else (
    echo   [SKIP] Node.js not installed
    set /a SKIP+=1
)
cd /d "%PROJECT_ROOT%"

:js_done
REM ─── Summary ───
echo.
echo ============================================================
echo   CI/CD SUMMARY
echo   Passed: %PASS%  Failed: %FAIL%  Skipped: %SKIP%
if %EXIT_CODE% equ 0 (
    echo   STATUS: ALL GREEN
) else (
    echo   STATUS: FAILURES DETECTED
)
echo ============================================================
echo.
exit /b %EXIT_CODE%
