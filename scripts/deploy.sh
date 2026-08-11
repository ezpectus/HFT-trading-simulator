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
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if [ "$DEPLOYMENT_MODE" = "docker" ]; then
        if ! command -v docker &> /dev/null; then
            log_error "Docker is not installed"
            exit 1
        fi
        
        if ! command -v docker-compose &> /dev/null; then
            log_error "Docker Compose is not installed"
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
        docker-compose down
    else
        # Stop native processes
        pkill -f "exchange_simulator" || true
        pkill -f "ai_signal_bot" || true
        pkill -f "hft_trade_bot" || true
        pkill -f "vite" || true
    fi
    
    log_info "Deployment stopped"
}

# Build Docker images
build_docker() {
    log_info "Building Docker images..."
    
    docker-compose build --no-cache
    
    log_info "Docker images built"
}

# Start Docker deployment
start_docker() {
    log_info "Starting Docker deployment..."
    
    docker-compose up -d
    
    log_info "Docker deployment started"
    log_info "Web UI available at http://localhost:3000"
}

# Start native deployment
start_native() {
    log_info "Starting native deployment..."
    
    # Start exchange simulator
    log_info "Starting Exchange Simulator..."
    cd exchange_simulator
    python -m exchange_simulator --no-visualizer > "$LOG_DIR/exchange_simulator.log" 2>&1 &
    EXCHANGE_PID=$!
    echo $EXCHANGE_PID > "$LOG_DIR/exchange_simulator.pid"
    cd ..
    
    # Wait for exchange simulator to start
    sleep 5
    
    # Start AI signal bot
    log_info "Starting AI Signal Bot..."
    cd ai-signal-bot
    python run.py > "$LOG_DIR/ai_signal_bot.log" 2>&1 &
    AI_PID=$!
    echo $AI_PID > "$LOG_DIR/ai_signal_bot.pid"
    cd ..
    
    # Wait for AI signal bot to start
    sleep 5
    
    # Start HFT trade bot
    log_info "Starting HFT Trade Bot..."
    cd hft-trade-bot
    ./build/hft_trade_bot config/config.yaml > "$LOG_DIR/hft_trade_bot.log" 2>&1 &
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
    
    for i in $(seq 1 $MAX_RETRIES); do
        log_info "Health check attempt $i/$MAX_RETRIES"
        
        # Check exchange simulator
        if curl -s http://localhost:8765/health > /dev/null 2>&1; then
            log_info "Exchange Simulator: Healthy"
        else
            log_warn "Exchange Simulator: Not healthy yet"
        fi
        
        # Check AI signal bot
        if curl -s http://localhost:8766/health > /dev/null 2>&1; then
            log_info "AI Signal Bot: Healthy"
        else
            log_warn "AI Signal Bot: Not healthy yet"
        fi
        
        # Check HFT trade bot
        if curl -s http://localhost:9091/health > /dev/null 2>&1; then
            log_info "HFT Trade Bot: Healthy"
        else
            log_warn "HFT Trade Bot: Not healthy yet"
        fi
        
        # Check web UI
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            log_info "Web UI: Healthy"
        else
            log_warn "Web UI: Not healthy yet"
        fi
        
        sleep $RETRY_DELAY
    done
    
    log_info "Health checks completed"
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
    
    # Restore configurations
    if [ -f "$BACKUP_DIR/config/config_$TIMESTAMP.tar.gz" ]; then
        log_info "Restoring configurations..."
        tar -xzf "$BACKUP_DIR/config/config_$TIMESTAMP.tar.gz"
    else
        log_error "Backup not found: $BACKUP_DIR/config/config_$TIMESTAMP.tar.gz"
        exit 1
    fi
    
    # Restore databases
    if [ -d "$BACKUP_DIR/database/data_$TIMESTAMP" ]; then
        log_info "Restoring databases..."
        rm -rf exchange_simulator/data
        cp -r "$BACKUP_DIR/database/data_$TIMESTAMP" exchange_simulator/data
    fi
    
    stop_deployment
    
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
        docker-compose ps 2>/dev/null || ps aux | grep -E "(exchange_simulator|ai_signal_bot|hft_trade_bot)" | grep -v grep
        ;;
    *)
        usage
        exit 1
        ;;
esac
