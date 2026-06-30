#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Docker production start script (Linux/macOS)
# Starts all services with docker-compose.prod.yml
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo "============================================"
echo " Trading System - Production (Docker)"
echo "============================================"
echo

# Check if .env.prod exists
if [ ! -f ".env.prod" ]; then
    echo "[WARN] .env.prod not found. Copying from .env.prod.example..."
    cp .env.prod.example .env.prod
    echo "[WARN] Edit .env.prod with your API keys before running in production mode!"
    echo
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker not found. Please install Docker."
    exit 1
fi

# Determine compose command
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo "[ERROR] docker-compose not found. Please install Docker Compose."
    exit 1
fi

# Parse arguments
MODE="${1:-up}"

case "$MODE" in
    up)
        echo "[INFO] Building and starting all production services..."
        $COMPOSE_CMD -f docker-compose.prod.yml --env-file .env.prod up -d --build
        echo
        echo "[OK] All services started!"
        echo "  - Web UI:       http://localhost:3000"
        echo "  - Grafana:      http://localhost:3001"
        echo "  - Prometheus:   http://localhost:9090"
        echo "  - AI Signals:   ws://localhost:8766"
        echo "  - Exchange:     ws://localhost:8765"
        echo
        ;;
    down)
        echo "[INFO] Stopping all production services..."
        $COMPOSE_CMD -f docker-compose.prod.yml down
        echo "[OK] All services stopped."
        ;;
    build)
        echo "[INFO] Building all images (no cache)..."
        $COMPOSE_CMD -f docker-compose.prod.yml build --no-cache
        echo "[OK] Build complete."
        ;;
    logs)
        echo "[INFO] Showing logs (Ctrl+C to exit)..."
        $COMPOSE_CMD -f docker-compose.prod.yml logs -f
        ;;
    ps)
        $COMPOSE_CMD -f docker-compose.prod.yml ps
        ;;
    restart)
        echo "[INFO] Restarting all services..."
        $COMPOSE_CMD -f docker-compose.prod.yml restart
        echo "[OK] All services restarted."
        ;;
    *)
        echo "Usage: ./docker.sh [up|down|build|logs|ps|restart]"
        echo
        echo "  up       - Build and start all services (default)"
        echo "  down     - Stop and remove all containers"
        echo "  build    - Rebuild all images without cache"
        echo "  logs     - Follow container logs"
        echo "  ps       - Show container status"
        echo "  restart  - Restart all services"
        ;;
esac
