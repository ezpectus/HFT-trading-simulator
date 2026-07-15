@echo off
REM ============================================================
REM  Trading System — Install All Dependencies (Windows)
REM  Installs Python, C++, and Node.js dependencies, then
REM  builds the C++ HFT Trade Bot.
REM
REM  Usage: install-deps.bat
REM ============================================================

setlocal enabledelayedexpansion

set PROJECT_ROOT=%~dp0

echo ============================================
echo  Trading System — Dependency Installer
echo ============================================
echo.

REM ── Check Python ──────────────────────────────────────────
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.12+ from https://python.org
    exit /b 1
)
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo [OK] Python %PY_VER% found

REM ── Check Node ────────────────────────────────────────────
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found. Install Node.js 22+ from https://nodejs.org
    exit /b 1
)
for /f "tokens=1 delims= " %%v in ('npm --version 2^>^&1') do set NPM_VER=%%v
echo [OK] npm %NPM_VER% found

REM ── Check CMake (optional, for C++ build) ─────────────────
set HAS_CMAKE=0
where cmake >nul 2>&1
if not errorlevel 1 (
    set HAS_CMAKE=1
    for /f "tokens=3 delims= " %%v in ('cmake --version 2^>^&1') do set CMAKE_VER=%%v
    echo [OK] CMake !CMAKE_VER! found
) else (
    echo [WARN] CMake not found — C++ HFT Trade Bot will be skipped
    echo        Install CMake 3.16+ from https://cmake.org to build the HFT engine
)

REM ── Check websocketpp (header-only, cloned manually) ─────
set WEBSOCKETPP_DIR=%PROJECT_ROOT%websocketpp
if not exist "%WEBSOCKETPP_DIR%\websocketpp\client.hpp" (
    echo [INFO] Cloning websocketpp (header-only library)...
    cd /d "%PROJECT_ROOT%"
    git clone https://github.com/zaphoyd/websocketpp.git
    if errorlevel 1 (
        echo [WARN] Failed to clone websocketpp — C++ build may fail
    ) else (
        echo [OK] websocketpp cloned
    )
) else (
    echo [OK] websocketpp found
)

echo.
echo --------------------------------------------
echo  [1/4] Exchange Simulator (Python)
echo --------------------------------------------
cd /d "%PROJECT_ROOT%exchange_simulator"
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install exchange_simulator dependencies
    exit /b 1
)
echo [OK] Exchange Simulator dependencies installed

echo.
echo --------------------------------------------
echo  [2/4] AI Signal Bot (Python)
echo --------------------------------------------
cd /d "%PROJECT_ROOT%ai-signal-bot"
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install ai-signal-bot dependencies
    exit /b 1
)
echo [OK] AI Signal Bot dependencies installed

echo.
echo --------------------------------------------
echo  [3/4] HFT Trade Bot (C++20)
echo --------------------------------------------
cd /d "%PROJECT_ROOT%hft-trade-bot"
if "!HAS_CMAKE!"=="1" (
    if not exist build mkdir build
    cd build
    echo [INFO] Running cmake configure...
    cmake .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=%VCPKG_ROOT%\scripts\buildsystems\vcpkg.cmake -DWEBSOCKETPP_INCLUDE_DIR="%WEBSOCKETPP_DIR%"
    if errorlevel 1 (
        echo [ERROR] CMake configuration failed
        echo        Make sure you have a C++20 compiler (MSVC 19.29+, GCC 13+, or Clang 17+)
        echo        and required libraries: Boost, OpenSSL, websocketpp, spdlog, fmt, nlohmann_json, yaml-cpp
        cd /d "%PROJECT_ROOT%"
        exit /b 1
    )
    echo [INFO] Building C++ HFT Trade Bot (this may take a minute)...
    cmake --build . --config Release -j
    if errorlevel 1 (
        echo [ERROR] C++ build failed
        cd /d "%PROJECT_ROOT%"
        exit /b 1
    )
    echo [OK] HFT Trade Bot built successfully
    cd /d "%PROJECT_ROOT%hft-trade-bot"
) else (
    echo [SKIP] CMake not found — skipping C++ build
    echo        The system will work without the HFT bot (3/4 services)
)
cd /d "%PROJECT_ROOT%"

echo.
echo --------------------------------------------
echo  [4/4] Web UI (React + Vite)
echo --------------------------------------------
cd /d "%PROJECT_ROOT%web-ui"
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install Web UI dependencies
    cd /d "%PROJECT_ROOT%"
    exit /b 1
)
echo [OK] Web UI dependencies installed

cd /d "%PROJECT_ROOT%"
echo.
echo ============================================
echo  All dependencies installed successfully!
echo ============================================
echo.
echo  Next step: Run no-docker.bat to start all services
echo    or:   Run start.bat to start with CLI monitors
echo.
echo  Services:
echo    Exchange Simulator  — ws://localhost:8765
echo    AI Signal Bot       — ws://localhost:8766
echo    HFT Trade Bot       — ws://localhost:8767 (if built)
echo    Web UI              — http://localhost:3000
echo.
endlocal
