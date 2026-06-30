@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM Docker production start script (Windows)
REM Starts all services with docker-compose.prod.yml
REM ─────────────────────────────────────────────────────────────────────────────

setlocal enabledelayedexpansion

echo ============================================
echo  Trading System - Production (Docker)
echo ============================================
echo.

REM Check if .env.prod exists
if not exist ".env.prod" (
    echo [WARN] .env.prod not found. Copying from .env.prod.example...
    copy .env.prod.example .env.prod >nul 2>&1
    echo [WARN] Edit .env.prod with your API keys before running in production mode!
    echo.
)

REM Check if Docker is available
where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker not found. Please install Docker Desktop.
    exit /b 1
)

where docker-compose >nul 2>&1
if errorlevel 1 (
    REM Try docker compose (newer syntax)
    docker compose version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] docker-compose not found. Please install Docker Compose.
        exit /b 1
    )
    set COMPOSE_CMD=docker compose
) else (
    set COMPOSE_CMD=docker-compose
)

REM Parse arguments
set MODE=%1
if "%MODE%"=="" set MODE=up

if "%MODE%"=="up" goto :up
if "%MODE%"=="down" goto :down
if "%MODE%"=="build" goto :build
if "%MODE%"=="logs" goto :logs
if "%MODE%"=="ps" goto :ps
if "%MODE%"=="restart" goto :restart
goto :usage

:up
echo [INFO] Building and starting all production services...
%COMPOSE_CMD% -f docker-compose.prod.yml --env-file .env.prod up -d --build
if errorlevel 1 (
    echo [ERROR] Failed to start services.
    exit /b 1
)
echo.
echo [OK] All services started!
echo   - Web UI:       http://localhost:3000
echo   - Grafana:      http://localhost:3001
echo   - Prometheus:   http://localhost:9090
echo   - AI Signals:   ws://localhost:8766
echo   - Exchange:     ws://localhost:8765
echo.
goto :end

:down
echo [INFO] Stopping all production services...
%COMPOSE_CMD% -f docker-compose.prod.yml down
echo [OK] All services stopped.
goto :end

:build
echo [INFO] Building all images (no cache)...
%COMPOSE_CMD% -f docker-compose.prod.yml build --no-cache
echo [OK] Build complete.
goto :end

:logs
echo [INFO] Showing logs (Ctrl+C to exit)...
%COMPOSE_CMD% -f docker-compose.prod.yml logs -f
goto :end

:ps
%COMPOSE_CMD% -f docker-compose.prod.yml ps
goto :end

:restart
echo [INFO] Restarting all services...
%COMPOSE_CMD% -f docker-compose.prod.yml restart
echo [OK] All services restarted.
goto :end

:usage
echo Usage: docker.bat [up^|down^|build^|logs^|ps^|restart]
echo.
echo   up       - Build and start all services (default)
echo   down     - Stop and remove all containers
echo   build    - Rebuild all images without cache
echo   logs     - Follow container logs
echo   ps       - Show container status
echo   restart  - Restart all services
goto :end

:end
endlocal
