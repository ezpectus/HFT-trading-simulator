@echo off
REM Deployment script for HFT Trading System (Windows)
REM Supports Docker and native deployment

setlocal enabledelayedexpansion

REM Configuration
set DEPLOYMENT_MODE=%DEPLOYMENT_MODE%
if "%DEPLOYMENT_MODE%"=="" set DEPLOYMENT_MODE=docker

set ENVIRONMENT=%ENVIRONMENT%
if "%ENVIRONMENT%"=="" set ENVIRONMENT=production

REM ENVIRONMENT selects the configs the native path passes to each
REM service (mirrors docker-compose.yml dev vs docker-compose.prod.yml).
if "%ENVIRONMENT%"=="dev" (
    set AI_CONFIG=config\settings.testnet.yaml
    set HFT_CONFIG=config\config.yaml
) else (
    set AI_CONFIG=config\settings.yaml
    set HFT_CONFIG=config\config.prod.yaml
)

set BACKUP_DIR=.\backup
set LOG_DIR=.\logs

REM Functions
:log_info
echo [INFO] %~1
goto :eof

:log_warn
echo [WARN] %~1
goto :eof

:log_error
echo [ERROR] %~1
goto :eof

REM Create backup directories
:setup_backup_dirs
call :log_info "Setting up backup directories..."
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if not exist "%BACKUP_DIR%\config" mkdir "%BACKUP_DIR%\config"
if not exist "%BACKUP_DIR%\database" mkdir "%BACKUP_DIR%\database"
if not exist "%BACKUP_DIR%\audit" mkdir "%BACKUP_DIR%\audit"
goto :eof

REM Backup current deployment
:backup_deployment
call :log_info "Backing up current deployment..."
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do (set mydate=%%c%%a%%b)
for /f "tokens=1-2 delims=: " %%a in ('time /t') do (set mytime=%%a%%b)
set TIMESTAMP=%mydate%_%mytime%
set TIMESTAMP=%TIMESTAMP: =0%

REM Backup configurations
tar -czf "%BACKUP_DIR%\config\config_%TIMESTAMP%.tar.gz" shared_config.yaml exchange_simulator\config.yaml ai-signal-bot\config\settings.yaml hft-trade-bot\config\config.yaml 2>nul

REM Backup databases
if exist "exchange_simulator\data" xcopy /E /I /Y exchange_simulator\data "%BACKUP_DIR%\database\data_%TIMESTAMP%" 2>nul
if exist "ai-signal-bot\data" xcopy /E /I /Y ai-signal-bot\data "%BACKUP_DIR%\database\ai_data_%TIMESTAMP%" 2>nul

REM Backup audit logs
if exist "exchange_simulator\logs\audit" xcopy /E /I /Y exchange_simulator\logs\audit "%BACKUP_DIR%\audit\audit_%TIMESTAMP%" 2>nul

call :log_info "Backup completed: %TIMESTAMP%"
goto :eof

REM Check prerequisites
:check_prerequisites
call :log_info "Checking prerequisites..."

if "%DEPLOYMENT_MODE%"=="docker" (
    docker --version >nul 2>&1
    if errorlevel 1 (
        call :log_error "Docker is not installed"
        exit /b 1
    )
    
    docker compose version >nul 2>&1
    if errorlevel 1 (
        call :log_error "Docker Compose (v2 plugin) is not installed"
        exit /b 1
    )
) else (
    python --version >nul 2>&1
    if errorlevel 1 (
        call :log_error "Python is not installed"
        exit /b 1
    )
    
    node --version >nul 2>&1
    if errorlevel 1 (
        call :log_error "Node.js is not installed"
        exit /b 1
    )
)

call :log_info "Prerequisites check passed"
goto :eof

REM Stop current deployment
:stop_deployment
call :log_info "Stopping current deployment..."

if "%DEPLOYMENT_MODE%"=="docker" (
    docker compose down
) else (
    REM start /B processes share the console — WINDOWTITLE filters never
    REM match. Kill by command line via CIM instead.
    powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -match 'exchange_simulator --no-visualizer|run\.py --metrics' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
    taskkill /F /IM hft_trade_bot.exe 2>nul
    powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'vite.*preview|preview.*vite' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
)

call :log_info "Deployment stopped"
goto :eof

REM Build Docker images
:build_docker
call :log_info "Building Docker images..."
docker compose build --no-cache
call :log_info "Docker images built"
goto :eof

REM Start Docker deployment
:start_docker
call :log_info "Starting Docker deployment..."
docker compose up -d
call :log_info "Docker deployment started"
call :log_info "Web UI available at http://localhost:3000"
goto :eof

REM Start native deployment
:start_native
call :log_info "Starting native deployment..."

REM Start exchange simulator — run from repo root: `python -m
REM exchange_simulator` cannot resolve the package from inside itself.
call :log_info "Starting Exchange Simulator..."
start /B python -m exchange_simulator --no-visualizer > "%LOG_DIR%\exchange_simulator.log" 2>&1
timeout /t 5 /nobreak >nul

REM Start AI signal bot — --metrics starts the HealthServer on :8080
REM (same as docker-compose.yml) so the :8080/ready probe can pass.
call :log_info "Starting AI Signal Bot (env=%ENVIRONMENT%, config=%AI_CONFIG%)..."
cd ai-signal-bot
start /B python run.py --metrics --config "%AI_CONFIG%" > "%LOG_DIR%\ai_signal_bot.log" 2>&1
cd ..
timeout /t 5 /nobreak >nul

REM Start HFT trade bot
call :log_info "Starting HFT Trade Bot (config=%HFT_CONFIG%)..."
cd hft-trade-bot
start /B build\hft_trade_bot.exe %HFT_CONFIG% > "%LOG_DIR%\hft_trade_bot.log" 2>&1
cd ..
timeout /t 5 /nobreak >nul

REM Start web UI
call :log_info "Starting Web UI..."
cd web-ui
call npm run build
start /B npm run preview > "%LOG_DIR%\web_ui.log" 2>&1
cd ..

call :log_info "Native deployment started"
call :log_info "Web UI available at http://localhost:3000"
goto :eof

REM Health check
:health_check
call :log_info "Running health checks..."

set MAX_RETRIES=30
set RETRY_DELAY=2
set ALL_HEALTHY=0

for /L %%i in (1,1,%MAX_RETRIES%) do (
    call :log_info "Health check attempt %%i/%MAX_RETRIES%"
    set HEALTHY=0

    REM Check exchange simulator (HTTP health on :8775; :8765 is WS-only)
    curl -s http://localhost:8775/health >nul 2>&1
    if errorlevel 1 (
        call :log_warn "Exchange Simulator: Not healthy yet"
    ) else (
        call :log_info "Exchange Simulator: Healthy"
        set /a HEALTHY+=1
    )

    REM Check AI signal bot (real HealthServer on :8080; :8766 is WS-only)
    curl -s http://localhost:8080/ready >nul 2>&1
    if errorlevel 1 (
        call :log_warn "AI Signal Bot: Not healthy yet"
    ) else (
        call :log_info "AI Signal Bot: Healthy"
        set /a HEALTHY+=1
    )

    REM Check HFT trade bot
    curl -s http://localhost:9091/health >nul 2>&1
    if errorlevel 1 (
        call :log_warn "HFT Trade Bot: Not healthy yet"
    ) else (
        call :log_info "HFT Trade Bot: Healthy"
        set /a HEALTHY+=1
    )

    REM Check web UI — docker nginx serves exact /health; native vite
    REM preview answers 200 for ANY path (SPA fallback), so verify the
    REM root page actually contains the app mount point.
    if "%DEPLOYMENT_MODE%"=="docker" (
        curl -s http://localhost:3000/health >nul 2>&1
    ) else (
        curl -s http://localhost:3000/ | findstr /C:"id=\"root\"" >nul 2>&1
    )
    if errorlevel 1 (
        call :log_warn "Web UI: Not healthy yet"
    ) else (
        call :log_info "Web UI: Healthy"
        set /a HEALTHY+=1
    )

    if !HEALTHY!==4 (
        set ALL_HEALTHY=1
        goto :health_done
    )

    timeout /t %RETRY_DELAY% /nobreak >nul
)

:health_done
if "%ALL_HEALTHY%"=="1" (
    call :log_info "Health checks completed: all services healthy"
) else (
    call :log_error "Health checks failed: one or more services unhealthy"
    exit /b 1
)
goto :eof

REM Main deployment
:deploy
call :log_info "Starting deployment..."
call :log_info "Mode: %DEPLOYMENT_MODE%"
call :log_info "Environment: %ENVIRONMENT%"

call :setup_backup_dirs
call :backup_deployment
call :check_prerequisites
call :stop_deployment

if "%DEPLOYMENT_MODE%"=="docker" (
    call :build_docker
    call :start_docker
) else (
    call :start_native
)

call :health_check
if errorlevel 1 exit /b 1

call :log_info "Deployment completed successfully"
goto :eof

REM Rollback deployment
:rollback
if "%2"=="" (
    call :log_error "Please specify backup timestamp (e.g., deploy.bat rollback 20231201_120000)"
    exit /b 1
)

set TIMESTAMP=%2

if exist "%BACKUP_DIR%\config\config_%TIMESTAMP%.tar.gz" (
    call :log_info "Restoring configurations..."
    tar -xzf "%BACKUP_DIR%\config\config_%TIMESTAMP%.tar.gz"
) else (
    call :log_error "Backup not found: %BACKUP_DIR%\config\config_%TIMESTAMP%.tar.gz"
    exit /b 1
)

if exist "%BACKUP_DIR%\database\data_%TIMESTAMP%" (
    call :log_info "Restoring databases..."
    rmdir /S /Q exchange_simulator\data 2>nul
    xcopy /E /I /Y "%BACKUP_DIR%\database\data_%TIMESTAMP%" exchange_simulator\data
)

call :stop_deployment

if "%DEPLOYMENT_MODE%"=="docker" (
    call :start_docker
) else (
    call :start_native
)

call :log_info "Rollback completed"
goto :eof

REM Show usage
:usage
echo Usage: %~nx0 [command] [options]
echo.
echo Commands:
echo   deploy       Deploy the system (default)
echo   rollback     Rollback to a specific backup
echo   stop         Stop the deployment
echo   restart      Restart the deployment
echo   status       Show deployment status
echo.
echo Options:
echo   DEPLOYMENT_MODE=docker^|native  Set deployment mode (default: docker)
echo   ENVIRONMENT=production^|dev    Set environment (default: production)
echo.
echo Examples:
echo   %~nx0 deploy
echo   %~nx0 deploy DEPLOYMENT_MODE=native
echo   %~nx0 rollback 20231201_120000
echo   %~nx0 stop
goto :eof

REM Main
if "%1"=="" (
    call :deploy
) else if "%1"=="deploy" (
    call :deploy
) else if "%1"=="rollback" (
    call :rollback %1 %2
) else if "%1"=="stop" (
    call :stop_deployment
) else if "%1"=="restart" (
    call :stop_deployment
    call :deploy
) else if "%1"=="status" (
    if "%DEPLOYMENT_MODE%"=="docker" (
        docker compose ps
    ) else (
        tasklist | findstr /I "python.exe node.exe hft_trade_bot.exe"
    )
) else (
    call :usage
    exit /b 1
)

endlocal
