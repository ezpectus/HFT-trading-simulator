#!/bin/bash
# Deployment script for HFT Trading System
# Supports Docker and native deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DEPLOYMENT_MODE=${DEPLOYMENT_MODE:-docker}
ENVIRONMENT=${ENVIRONMENT:-production}
BACKUP_DIR="./backup"
LOG_DIR="./logs"

# ENVIRONMENT selects the configs the native path passes to each service
# (mirrors docker-compose.yml dev vs docker-compose.prod.yml mounts).
if [ "$ENVIRONMENT" = "dev" ]; then
    AI_CONFIG="config/settings.testnet.yaml"
    HFT_CONFIG="config/config.yaml"
else
    AI_CONFIG="config/settings.yaml"
    HFT_CONFIG="config/config.prod.yaml"
fi

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create backup directories
setup_backup_dirs() {
    log_info "Setting up backup directories..."
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$LOG_DIR"
    mkdir -p "$BACKUP_DIR/config"
    mkdir -p "$BACKUP_DIR/database"
    mkdir -p "$BACKUP_DIR/audit"
}

# Backup current deployment
backup_deployment() {
    log_info "Backing up current deployment..."
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    
    # Backup configurations
    tar -czf "$BACKUP_DIR/config/config_$TIMESTAMP.tar.gz" \
        shared_config.yaml \
        exchange_simulator/config.yaml \
        ai-signal-bot/config/settings.yaml \
        hft-trade-bot/config/config.yaml 2>/dev/null || true
    
    # Backup databases
    cp -r exchange_simulator/data "$BACKUP_DIR/database/data_$TIMESTAMP" 2>/dev/null || true
    cp -r ai-signal-bot/data "$BACKUP_DIR/database/ai_data_$TIMESTAMP" 2>/dev/null || true
    
    # Backup audit logs
    cp -r exchange_simulator/logs/audit "$BACKUP_DIR/audit/audit_$TIMESTAMP" 2>/dev/null || true
    
    log_info "Backup completed: $TIMESTAMP"

    # Retention: keep only last 5 backups
    local backup_count=$(ls -1d "$BACKUP_DIR"/config/config_*.tar.gz 2>/dev/null | wc -l)
    if [ "$backup_count" -gt 5 ]; then
        log_info "Cleaning up old backups (keeping last 5)..."
        ls -1t "$BACKUP_DIR"/config/config_*.tar.gz | tail -n +6 | while read -r old_backup; do
            local old_ts=$(echo "$old_backup" | grep -oP '\d{8}_\d{6}')
            rm -f "$old_backup"
            rm -rf "$BACKUP_DIR/database/data_$old_ts" "$BACKUP_DIR/database/ai_data_$old_ts" "$BACKUP_DIR/audit/audit_$old_ts" 2>/dev/null || true
            log_info "Removed backup: $old_ts"
        done
    fi
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if [ "$DEPLOYMENT_MODE" = "docker" ]; then
        if ! command -v docker &> /dev/null; then
            log_error "Docker is not installed"
            exit 1
        fi
        
        if ! docker compose version &> /dev/null; then
            log_error "Docker Compose (v2 plugin) is not installed"
            exit 1
        fi
    else
        if ! command -v python3 &> /dev/null; then
            log_error "Python 3 is not installed"
            exit 1
        fi
        
        if ! command -v node &> /dev/null; then
            log_error "Node.js is not installed"
            exit 1
        fi
    fi
    
    log_info "Prerequisites check passed"
}

# Stop current deployment
stop_deployment() {
    log_info "Stopping current deployment..."
    
    if [ "$DEPLOYMENT_MODE" = "docker" ]; then
        docker compose down
    else
        # Stop native processes via the pid files start_native writes —
        # pkill patterns can't match e.g. `python run.py` for the bot.
        local svc pid
        for svc in exchange_simulator ai_signal_bot hft_trade_bot web_ui; do
            local pidfile="$LOG_DIR/$svc.pid"
            if [ -f "$pidfile" ]; then
                pid=$(cat "$pidfile")
                if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                    log_info "Stopping $svc (pid $pid)..."
                    kill "$pid" 2>/dev/null || true
                fi
                rm -f "$pidfile"
            else
                log_warn "$svc: no pid file — not started by deploy.sh?"
            fi
        done
    fi
    
    log_info "Deployment stopped"
}

# Build Docker images
build_docker() {
    log_info "Building Docker images..."
    
    docker compose build --no-cache
    
    log_info "Docker images built"
}

# Start Docker deployment
start_docker() {
    log_info "Starting Docker deployment..."
    
    docker compose up -d
    
    log_info "Docker deployment started"
    log_info "Web UI available at http://localhost:3000"
}

# Start native deployment
start_native() {
    log_info "Starting native deployment..."
    
    # Start exchange simulator — run from repo root: `python -m
    # exchange_simulator` cannot resolve the package from inside itself.
    log_info "Starting Exchange Simulator..."
    python3 -m exchange_simulator --no-visualizer > "$LOG_DIR/exchange_simulator.log" 2>&1 &
    EXCHANGE_PID=$!
    echo $EXCHANGE_PID > "$LOG_DIR/exchange_simulator.pid"

    # Wait for exchange simulator to start
    sleep 5

    # Start AI signal bot — --metrics starts the HealthServer on :8080
    # (same as docker-compose.yml) so the health_check /ready probe works.
    log_info "Starting AI Signal Bot (env=$ENVIRONMENT, config=$AI_CONFIG)..."
    cd ai-signal-bot
    python3 run.py --metrics --config "$AI_CONFIG" > "$LOG_DIR/ai_signal_bot.log" 2>&1 &
    AI_PID=$!
    echo $AI_PID > "$LOG_DIR/ai_signal_bot.pid"
    cd ..

    # Wait for AI signal bot to start
    sleep 5

    # Start HFT trade bot
    log_info "Starting HFT Trade Bot (config=$HFT_CONFIG)..."
    cd hft-trade-bot
    ./build/hft_trade_bot "$HFT_CONFIG" > "$LOG_DIR/hft_trade_bot.log" 2>&1 &
    HFT_PID=$!
    echo $HFT_PID > "$LOG_DIR/hft_trade_bot.pid"
    cd ..
    
    # Start web UI
    log_info "Starting Web UI..."
    cd web-ui
    npm run build
    npm run preview > "$LOG_DIR/web_ui.log" 2>&1 &
    WEB_PID=$!
    echo $WEB_PID > "$LOG_DIR/web_ui.pid"
    cd ..
    
    log_info "Native deployment started"
    log_info "Web UI available at http://localhost:3000"
}

# Health check
health_check() {
    log_info "Running health checks..."
    
    MAX_RETRIES=30
    RETRY_DELAY=2
    
    local all_healthy=false
    
    for i in $(seq 1 $MAX_RETRIES); do
        log_info "Health check attempt $i/$MAX_RETRIES"
        local healthy_count=0
        
        # Check exchange simulator (HTTP health/metrics on :8775; :8765 is WS-only)
        if curl -s http://localhost:8775/health > /dev/null 2>&1; then
            log_info "Exchange Simulator: Healthy"
            healthy_count=$((healthy_count + 1))
        else
            log_warn "Exchange Simulator: Not healthy yet"
        fi
        
        # Check AI signal bot (real HealthServer on :8080; :8766 is WS-only)
        if curl -s http://localhost:8080/ready > /dev/null 2>&1; then
            log_info "AI Signal Bot: Healthy"
            healthy_count=$((healthy_count + 1))
        else
            log_warn "AI Signal Bot: Not healthy yet"
        fi
        
        # Check HFT trade bot
        if curl -s http://localhost:9091/health > /dev/null 2>&1; then
            log_info "HFT Trade Bot: Healthy"
            healthy_count=$((healthy_count + 1))
        else
            log_warn "HFT Trade Bot: Not healthy yet"
        fi
        
        # Check web UI — docker nginx serves exact /health; native vite
        # preview answers 200 for ANY path (SPA fallback), so verify the
        # root page actually contains the app mount point.
        if [ "$DEPLOYMENT_MODE" = "docker" ]; then
            web_check="curl -s http://localhost:3000/health"
        else
            web_check="curl -s http://localhost:3000/ | grep -q 'id=\"root\"'"
        fi
        if eval "$web_check" > /dev/null 2>&1; then
            log_info "Web UI: Healthy"
            healthy_count=$((healthy_count + 1))
        else
            log_warn "Web UI: Not healthy yet"
        fi
        
        if [ "$healthy_count" -eq 4 ]; then
            all_healthy=true
            break
        fi
        
        sleep $RETRY_DELAY
    done
    
    if [ "$all_healthy" = true ]; then
        log_info "Health checks completed: all services healthy"
    else
        log_error "Health checks completed: one or more services unhealthy"
        exit 1
    fi
}

# Main deployment
deploy() {
    log_info "Starting deployment..."
    log_info "Mode: $DEPLOYMENT_MODE"
    log_info "Environment: $ENVIRONMENT"
    
    setup_backup_dirs
    backup_deployment
    check_prerequisites
    stop_deployment
    
    if [ "$DEPLOYMENT_MODE" = "docker" ]; then
        build_docker
        start_docker
    else
        start_native
    fi
    
    health_check
    
    log_info "Deployment completed successfully"
}

# Rollback deployment
rollback() {
    log_info "Rolling back deployment..."
    
    if [ -z "$1" ]; then
        log_error "Please specify backup timestamp (e.g., ./deploy.sh rollback 20231201_120000)"
        exit 1
    fi
    
    TIMESTAMP=$1

    # Stop services before swapping files — restoring under a running
    # simulator/bot lets live writers race the restore.
    stop_deployment

    # Restore configurations
    if [ -f "$BACKUP_DIR/config/config_$TIMESTAMP.tar.gz" ]; then
        log_info "Restoring configurations..."
        tar -xzf "$BACKUP_DIR/config/config_$TIMESTAMP.tar.gz"
    else
        log_error "Backup not found: $BACKUP_DIR/config/config_$TIMESTAMP.tar.gz"
        exit 1
    fi

    # Restore databases (atomic swap: copy first, then replace)
    if [ -d "$BACKUP_DIR/database/data_$TIMESTAMP" ]; then
        log_info "Restoring exchange data..."
        cp -r "$BACKUP_DIR/database/data_$TIMESTAMP" exchange_simulator/data_restored
        if [ $? -eq 0 ]; then
            rm -rf exchange_simulator/data
            mv exchange_simulator/data_restored exchange_simulator/data
        else
            log_error "Failed to restore database from backup"
            rm -rf exchange_simulator/data_restored 2>/dev/null || true
            exit 1
        fi
    fi

    # Restore AI bot data (signals/trades SQLite) — backed up every deploy,
    # previously never restored (S297). Atomic swap: a merged old/new WAL pair
    # can corrupt the db.
    if [ -d "$BACKUP_DIR/database/ai_data_$TIMESTAMP" ]; then
        log_info "Restoring AI bot data..."
        cp -r "$BACKUP_DIR/database/ai_data_$TIMESTAMP" ai-signal-bot/data_restored
        if [ $? -eq 0 ]; then
            rm -rf ai-signal-bot/data
            mv ai-signal-bot/data_restored ai-signal-bot/data
        else
            log_error "Failed to restore AI data from backup"
            rm -rf ai-signal-bot/data_restored 2>/dev/null || true
            exit 1
        fi
    fi

    # Restore audit logs — merge semantics: the snapshot contents are copied
    # over the live dir so audit entries written after the backup survive.
    if [ -d "$BACKUP_DIR/audit/audit_$TIMESTAMP" ]; then
        log_info "Restoring audit logs..."
        mkdir -p exchange_simulator/logs/audit
        cp -r "$BACKUP_DIR/audit/audit_$TIMESTAMP/." exchange_simulator/logs/audit/
    fi
    
    if [ "$DEPLOYMENT_MODE" = "docker" ]; then
        start_docker
    else
        start_native
    fi
    
    log_info "Rollback completed"
}

# Show usage
usage() {
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  deploy       Deploy the system (default)"
    echo "  rollback     Rollback to a specific backup"
    echo "  stop         Stop the deployment"
    echo "  restart      Restart the deployment"
    echo "  status       Show deployment status"
    echo ""
    echo "Options:"
    echo "  DEPLOYMENT_MODE=docker|native  Set deployment mode (default: docker)"
    echo "  ENVIRONMENT=production|dev    Set environment (default: production)"
    echo ""
    echo "Examples:"
    echo "  $0 deploy"
    echo "  $0 deploy DEPLOYMENT_MODE=native"
    echo "  $0 rollback 20231201_120000"
    echo "  $0 stop"
}

# Main
case "${1:-deploy}" in
    deploy)
        deploy
        ;;
    rollback)
        rollback "$2"
        ;;
    stop)
        stop_deployment
        ;;
    restart)
        stop_deployment
        deploy
        ;;
    status)
        if [ "$DEPLOYMENT_MODE" = "docker" ]; then
            docker compose ps
        else
            # Report from the pid files start_native writes — process
            # names like `python run.py` don't contain the service names.
            for svc in exchange_simulator ai_signal_bot hft_trade_bot web_ui; do
                pidfile="$LOG_DIR/$svc.pid"
                if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
                    log_info "$svc: running (pid $(cat "$pidfile"))"
                else
                    log_warn "$svc: not running"
                fi
            done
        fi
        ;;
    *)
        usage
        exit 1
        ;;
esac
