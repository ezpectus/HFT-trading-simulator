@echo off
REM ============================================================
REM  HFT Trading System — Start All Services
REM  Opens 4 service windows + 4 monitor windows
REM  Usage: start.bat [start^|stop^|install]
REM ============================================================

setlocal enabledelayedexpansion
set PROJECT_ROOT=%~dp0

set MODE=%1
if "%MODE%"=="" set MODE=start

if "%MODE%"=="start" goto :start
if "%MODE%"=="stop" goto :stop
if "%MODE%"=="install" goto :install
goto :usage

:install
echo [INFO] Installing all dependencies...
echo.

REM Clone websocketpp if not present
if not exist "%PROJECT_ROOT%websocketpp\websocketpp\client.hpp" (
    echo [INFO] Cloning websocketpp (header-only library)...
    cd /d "%PROJECT_ROOT%"
    git clone https://github.com/zaphoyd/websocketpp.git
    echo.
)

echo [1/4] Exchange Simulator...
cd /d "%PROJECT_ROOT%exchange_simulator"
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
echo Starting HFT Trading System...

REM Window 1: Exchange Simulator
start "Exchange Simulator" cmd /k "cd /d %~dp0exchange_simulator && python -m exchange_simulator --no-visualizer"

REM Wait for exchange to start
ping 127.0.0.1 -n 4 >nul 2>&1

REM Window 2: AI Signal Bot
start "AI Signal Bot" cmd /k "cd /d %~dp0ai-signal-bot && python run.py --dashboard --metrics"

REM Wait for signal bot to start
ping 127.0.0.1 -n 4 >nul 2>&1

REM Window 3: HFT Trade Bot (C++ — requires build)
if exist "%~dp0hft-trade-bot\build\Release\hft_trade_bot.exe" (
    start "HFT Trade Bot" cmd /k "cd /d %~dp0hft-trade-bot && build\Release\hft_trade_bot.exe config\config.yaml"
) else if exist "%~dp0hft-trade-bot\build\hft_trade_bot.exe" (
    start "HFT Trade Bot" cmd /k "cd /d %~dp0hft-trade-bot && build\hft_trade_bot.exe config\config.yaml"
) else if exist "%~dp0hft-trade-bot\build\hft_trade_bot" (
    start "HFT Trade Bot" cmd /k "cd /d %~dp0hft-trade-bot && build\hft_trade_bot config\config.yaml"
) else (
    echo [WARNING] HFT Trade Bot not built. Run: start.bat install
)

REM Window 4: Web UI
start "Web UI" cmd /k "cd /d %~dp0web-ui && npm run dev"

REM Wait for services to initialize
ping 127.0.0.1 -n 6 >nul 2>&1

REM Window 5: AI Signal Bot Monitor (live signal feed + bot status)
start "AI Signal Bot Monitor" cmd /k "cd /d %~dp0ai-signal-bot && python monitor.py"

REM Window 6: HFT Trade Bot Monitor (C++ engine status + log tail)
start "HFT Trade Bot Monitor" cmd /k "cd /d %~dp0hft-trade-bot && python monitor.py"

echo.
echo All services started:
echo   1. Exchange Simulator      - ws://localhost:8765 (metrics:8775)
echo   2. AI Signal Bot           - ws://localhost:8766
echo   3. HFT Trade Bot           - C++ engine (connects to :8765 + :8766)
echo   4. Web UI                  - http://localhost:3000
echo   5. AI Signal Bot Monitor   - live signal feed
echo   6. HFT Trade Bot Monitor   - C++ engine status
echo.
echo Close the CLI windows to stop each service.
goto :end

:stop
echo [INFO] Stopping all services...
taskkill /fi "WINDOWTITLE eq Exchange Simulator*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq AI Signal Bot Monitor*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq HFT Trade Bot Monitor*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq AI Signal Bot*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq HFT Trade Bot*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq Web UI*" /f >nul 2>&1
echo [OK] All services stopped.
goto :end

:usage
echo Usage: start.bat [start^|stop^|install]
echo.
echo   start    - Start all 6 windows (4 services + 2 monitors) (default)
echo   stop     - Stop all services
echo   install  - Install all dependencies (Python, C++, Node)
goto :end

:end
endlocal
