@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM No-Docker start script (Windows)
REM Starts all 4 services directly in separate terminal windows
REM ─────────────────────────────────────────────────────────────────────────────

setlocal enabledelayedexpansion

echo ============================================
echo  Trading System - Local (No Docker)
echo ============================================
echo.

REM Get project root
set PROJECT_ROOT=%~dp0

REM Check Python
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.12+.
    exit /b 1
)

REM Check Node
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found. Please install Node.js 20+.
    exit /b 1
)

REM Parse arguments
set MODE=%1
if "%MODE%"=="" set MODE=start

if "%MODE%"=="start" goto :start
if "%MODE%"=="stop" goto :stop
if "%MODE%"=="install" goto :install
goto :usage

:install
echo [INFO] Installing dependencies...
echo.

REM Clone websocketpp if not present
if not exist "%PROJECT_ROOT%websocketpp\websocketpp\client.hpp" (
    echo [INFO] Cloning websocketpp (header-only library)...
    cd /d "%PROJECT_ROOT%"
    git clone https://github.com/zaphoyd/websocketpp.git
    echo.
)

echo [1/4] Exchange Simulator...
cd /d "%PROJECT_ROOT%exchange-simulator"
pip install -r requirements.txt
echo.
echo [2/4] AI Signal Bot...
cd /d "%PROJECT_ROOT%ai-signal-bot"
pip install -r requirements.txt
echo.
echo [3/4] HFT Trade Bot (C++)...
cd /d "%PROJECT_ROOT%hft-trade-bot"
where cmake >nul 2>&1
if errorlevel 1 (
    echo [WARN] CMake not found. Skipping C++ build.
    echo        Install CMake from https://cmake.org/download/
) else (
    if not exist build mkdir build
    cd build
    cmake .. -DCMAKE_BUILD_TYPE=Release -DUSE_PCH=ON -DUSE_CCACHE=ON -DWEBSOCKETPP_INCLUDE_DIR="%PROJECT_ROOT%websocketpp" -DCMAKE_TOOLCHAIN_FILE=%VCPKG_ROOT%\scripts\buildsystems\vcpkg.cmake
    cmake --build . --config Release -j
    cd ..
)
echo.
echo [4/4] Web UI...
cd /d "%PROJECT_ROOT%web-ui"
npm install
echo.
echo [OK] All dependencies installed.
cd /d "%PROJECT_ROOT%"
goto :end

:start
echo [INFO] Starting all services in separate windows...
echo.

REM Window 1: Exchange Simulator
echo [1/4] Starting Exchange Simulator on :8765...
start "Exchange Simulator" cmd /k "cd /d %PROJECT_ROOT%exchange-simulator && python -m exchange_simulator --no-visualizer"

REM Wait for simulator to start
ping 127.0.0.1 -n 4 >nul 2>&1

REM Window 2: AI Signal Bot
echo [2/4] Starting AI Signal Bot on :8766...
start "AI Signal Bot" cmd /k "cd /d %PROJECT_ROOT%ai-signal-bot && python run.py --dashboard --metrics"

REM Wait for signal bot
ping 127.0.0.1 -n 4 >nul 2>&1

REM Window 3: HFT Trade Bot
echo [3/4] Starting HFT Trade Bot (C++ engine)...
if exist "%PROJECT_ROOT%hft-trade-bot\build\Release\hft_trade_bot.exe" (
    start "HFT Trade Bot" cmd /k "cd /d %PROJECT_ROOT%hft-trade-bot && build\Release\hft_trade_bot.exe config\config.yaml"
) else if exist "%PROJECT_ROOT%hft-trade-bot\build\hft_trade_bot.exe" (
    start "HFT Trade Bot" cmd /k "cd /d %PROJECT_ROOT%hft-trade-bot && build\hft_trade_bot.exe config\config.yaml"
) else if exist "%PROJECT_ROOT%hft-trade-bot\build\hft_trade_bot" (
    start "HFT Trade Bot" cmd /k "cd /d %PROJECT_ROOT%hft-trade-bot && build\hft_trade_bot config\config.yaml"
) else (
    echo [WARN] HFT Trade Bot binary not found. Build it first with: no-docker.bat install
)

REM Window 4: Web UI
echo [4/4] Starting Web UI on :3000...
start "Web UI" cmd /k "cd /d %PROJECT_ROOT%web-ui && npm run dev"

echo.
echo [OK] All services started in separate windows!
echo   - Exchange Simulator:  ws://localhost:8765 (metrics:8775)
echo   - AI Signal Bot:       ws://localhost:8766 (metrics:8080, 9090)
echo   - HFT Trade Bot:       C++ engine (connects to :8765 + :8766)
echo   - Web UI:              http://localhost:3000
echo.
echo Close the terminal windows to stop each service.
goto :end

:stop
echo [INFO] Stopping all services...
taskkill /fi "WINDOWTITLE eq Exchange Simulator*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq AI Signal Bot*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq HFT Trade Bot*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq Web UI*" /f >nul 2>&1
echo [OK] All services stopped.
goto :end

:usage
echo Usage: no-docker.bat [start^|stop^|install]
echo.
echo   start    - Start all 4 services in separate windows (default)
echo   stop     - Stop all services
echo   install  - Install all dependencies (Python, C++, Node)
goto :end

:end
endlocal
