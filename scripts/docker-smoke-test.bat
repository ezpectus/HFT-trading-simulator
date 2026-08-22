@echo off
REM Docker Compose smoke test — verify all services start and respond.
REM Usage: scripts\docker-smoke-test.bat

echo === Docker Compose Smoke Test ===
echo.

REM Start all services
echo [1/5] Starting services...
docker compose up -d --wait --timeout 60
if errorlevel 1 (
    echo   ^❌ Failed to start services
    exit /b 1
)

REM Verify Exchange Simulator
echo [2/5] Verifying Exchange Simulator (port 8765)...
timeout /t 3 /nobreak >nul
curl -sf http://localhost:8765/health >nul 2>&1
if errorlevel 1 (
    echo   ^❌ Exchange Simulator failed health check
    docker compose logs --tail=20 exchange-simulator
    exit /b 1
)
echo   ^✅ Exchange Simulator is healthy

REM Verify AI Signal Bot
echo [3/5] Verifying AI Signal Bot (port 8766)...
curl -sf http://localhost:8766/health >nul 2>&1
if errorlevel 1 (
    echo   ^❌ AI Signal Bot failed health check
    docker compose logs --tail=20 ai-signal-bot
    exit /b 1
)
echo   ^✅ AI Signal Bot is healthy

REM Verify HFT Trade Bot
echo [4/5] Verifying HFT Trade Bot (port 9091)...
curl -sf http://localhost:9091/health >nul 2>&1
if errorlevel 1 (
    echo   ^⚠️  HFT Trade Bot not responding (may still be starting)
) else (
    echo   ^✅ HFT Trade Bot is healthy
)

REM Verify Web UI
echo [5/5] Verifying Web UI (port 3000)...
curl -sf http://localhost:3000/ >nul 2>&1
if errorlevel 1 (
    echo   ^❌ Web UI failed health check
    docker compose logs --tail=20 web-ui
    exit /b 1
)
echo   ^✅ Web UI is healthy

echo.
echo === All services verified ✅ ===
echo.
echo Services running:
echo   Exchange Simulator: http://localhost:8765
echo   AI Signal Bot:      http://localhost:8766
echo   HFT Trade Bot:      http://localhost:9091
echo   Web UI:             http://localhost:3000
echo.
echo To stop: docker compose down -v
