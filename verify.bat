@echo off
REM ============================================================
REM  HFT Trading System — Verification Script (Windows)
REM  Runs Python tests, C++ build + tests, and JS tests
REM  Usage: verify.bat
REM ============================================================

setlocal enabledelayedexpansion
set PROJECT_ROOT=%~dp0
set EXIT_CODE=0

echo ============================================
echo  HFT Trading System — Verification
echo ============================================
echo.

REM ── 1. Python: Exchange Simulator ─────────────────────────
echo [1/5] Python tests — Exchange Simulator...
cd /d "%PROJECT_ROOT%exchange_simulator"
python -m pytest tests/ -v --tb=short 2>&1
if errorlevel 1 (
    echo [FAIL] Exchange Simulator tests failed
    set EXIT_CODE=1
) else (
    echo [OK] Exchange Simulator tests passed
)
echo.
cd /d "%PROJECT_ROOT%"

REM ── 2. Python: AI Signal Bot ──────────────────────────────
echo [2/5] Python tests — AI Signal Bot...
cd /d "%PROJECT_ROOT%ai-signal-bot"
python -m pytest tests/ -v --tb=short 2>&1
if errorlevel 1 (
    echo [FAIL] AI Signal Bot tests failed
    set EXIT_CODE=1
) else (
    echo [OK] AI Signal Bot tests passed
)
echo.
cd /d "%PROJECT_ROOT%"

REM ── 3. C++: Build + Tests ─────────────────────────────────
echo [3/5] C++ build + tests — HFT Trade Bot...
cd /d "%PROJECT_ROOT%hft-trade-bot"
where cmake >nul 2>&1
if errorlevel 1 (
    echo [SKIP] CMake not found — skipping C++ tests
) else (
    if not exist build mkdir build
    cd build
    cmake .. -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=%VCPKG_ROOT%\scripts\buildsystems\vcpkg.cmake -DWEBSOCKETPP_INCLUDE_DIR="%PROJECT_ROOT%websocketpp" 2>&1
    if errorlevel 1 (
        echo [FAIL] CMake configuration failed
        set EXIT_CODE=1
    ) else (
        cmake --build . --config Debug -j 2>&1
        if errorlevel 1 (
            echo [FAIL] C++ build failed
            set EXIT_CODE=1
        ) else (
            ctest --output-on-failure -C Debug 2>&1
            if errorlevel 1 (
                echo [FAIL] C++ tests failed
                set EXIT_CODE=1
            ) else (
                echo [OK] C++ build + tests passed
            )
        )
    )
    cd ..
)
echo.
cd /d "%PROJECT_ROOT%"

REM ── 4. JS: Lint + Tests + Build ───────────────────────────
echo [4/5] JS lint + tests + build — Web UI...
cd /d "%PROJECT_ROOT%web-ui"
where npm >nul 2>&1
if errorlevel 1 (
    echo [SKIP] npm not found — skipping JS tests
) else (
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
    call npx vitest run 2>&1
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
        echo [OK] JS build passed
    )
)
echo.
cd /d "%PROJECT_ROOT%"

REM ── 5. Summary ────────────────────────────────────────────
echo ============================================
if "!EXIT_CODE!"=="0" (
    echo  ALL CHECKS PASSED
) else (
    echo  SOME CHECKS FAILED — see output above
)
echo ============================================
echo.
endlocal
exit /b %EXIT_CODE%
