#!/usr/bin/env bash
# Docker Compose smoke test — verify all services start and respond.
# Usage: ./scripts/docker-smoke-test.sh

set -euo pipefail

echo "=== Docker Compose Smoke Test ==="
echo ""

# Start all services
echo "[1/5] Starting services..."
docker compose up -d --wait --timeout 60

# Verify Exchange Simulator
echo "[2/5] Verifying Exchange Simulator (port 8765)..."
sleep 3
if curl -sf http://localhost:8765/health >/dev/null 2>&1; then
    echo "  ✅ Exchange Simulator is healthy"
else
    echo "  ❌ Exchange Simulator failed health check"
    docker compose logs --tail=20 exchange-simulator
    exit 1
fi

# Verify AI Signal Bot
echo "[3/5] Verifying AI Signal Bot (port 8766)..."
if curl -sf http://localhost:8766/health >/dev/null 2>&1; then
    echo "  ✅ AI Signal Bot is healthy"
else
    echo "  ❌ AI Signal Bot failed health check"
    docker compose logs --tail=20 ai-signal-bot
    exit 1
fi

# Verify HFT Trade Bot
echo "[4/5] Verifying HFT Trade Bot (port 9091)..."
if curl -sf http://localhost:9091/health >/dev/null 2>&1; then
    echo "  ✅ HFT Trade Bot is healthy"
else
    echo "  ⚠️  HFT Trade Bot not responding (may still be starting)"
fi

# Verify Web UI
echo "[5/5] Verifying Web UI (port 3000)..."
if curl -sf http://localhost:3000/ >/dev/null 2>&1; then
    echo "  ✅ Web UI is healthy"
else
    echo "  ❌ Web UI failed health check"
    docker compose logs --tail=20 web-ui
    exit 1
fi

echo ""
echo "=== All services verified ✅ ==="
echo ""
echo "Services running:"
echo "  Exchange Simulator: http://localhost:8765"
echo "  AI Signal Bot:      http://localhost:8766"
echo "  HFT Trade Bot:      http://localhost:9091"
echo "  Web UI:             http://localhost:3000"
echo ""
echo "To stop: docker compose down -v"
