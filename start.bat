@echo off
REM ============================================================
REM  Crypto Trading Simulator — Start All Services
REM  Opens 4 service windows + 4 monitor windows
REM ============================================================

echo Starting Crypto Trading Simulator...

REM Window 1: Exchange Simulator
start "Exchange Simulator" cmd /k "cd /d %~dp0exchange-simulator && python -m exchange_simulator --no-visualizer"

REM Wait for exchange to start
timeout /t 3 /nobreak >nul

REM Window 2: AI Signal Bot
start "AI Signal Bot" cmd /k "cd /d %~dp0ai-signal-bot && python run.py --dashboard"

REM Wait for signal bot to start
timeout /t 3 /nobreak >nul

REM Window 3: HFT Trade Bot (C++ — requires build)
if exist "%~dp0hft-trade-bot\build\hft_trade_bot.exe" (
    start "HFT Trade Bot" cmd /k "cd /d %~dp0hft-trade-bot && build\hft_trade_bot config\config.yaml"
) else (
    echo [WARNING] HFT Trade Bot not built. Run: cd hft-trade-bot && mkdir build && cd build && cmake .. && make
)

REM Window 4: Web UI
start "Web UI" cmd /k "cd /d %~dp0web-ui && npm run dev"

REM Wait for services to initialize
timeout /t 5 /nobreak >nul

REM Window 5: AI Signal Bot Monitor (live signal feed + bot status)
start "AI Signal Bot Monitor" cmd /k "cd /d %~dp0ai-signal-bot && python monitor.py"

REM Window 6: HFT Trade Bot Monitor (C++ engine status + log tail)
start "HFT Trade Bot Monitor" cmd /k "cd /d %~dp0hft-trade-bot && python monitor.py"

REM Window 7: Unified Error Monitor (errors + warnings from all services)
start "Error Monitor" cmd /k "cd /d %~dp0 && python error_monitor.py"

REM Window 8: Price & Signal Monitor (live crypto prices + strategy signals)
start "Price & Signal Monitor" cmd /k "cd /d %~dp0 && python price_monitor.py"

echo.
echo All services started:
echo   1. Exchange Simulator      - ws://localhost:8765
echo   2. AI Signal Bot           - ws://localhost:8766
echo   3. HFT Trade Bot           - C++ engine
echo   4. Web UI                  - http://localhost:3000
echo   5. AI Signal Bot Monitor   - live signal feed
echo   6. HFT Trade Bot Monitor   - C++ engine status
echo   7. Error Monitor           - unified error viewer
echo   8. Price & Signal Monitor  - live prices + signals
echo.
echo Close the CLI windows to stop each service.
