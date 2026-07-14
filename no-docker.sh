#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# No-Docker start script (Linux/macOS)
# Starts all 4 services directly in separate terminal tabs
# ─────────────────────────────────────────────────────────────────────────────

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================"
echo " Trading System - Local (No Docker)"
echo "============================================"
echo

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python3 not found. Please install Python 3.12+."
    exit 1
fi

# Check Node
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm not found. Please install Node.js 20+."
    exit 1
fi

# Parse arguments
MODE="${1:-start}"

case "$MODE" in
    install)
        echo "[INFO] Installing dependencies..."
        echo

        # Clone websocketpp if not present
        if [ ! -f "$PROJECT_ROOT/websocketpp/websocketpp/client.hpp" ]; then
            echo "[INFO] Cloning websocketpp (header-only library)..."
            cd "$PROJECT_ROOT"
            git clone https://github.com/zaphoyd/websocketpp.git
            echo
        fi

        echo "[1/4] Exchange Simulator..."
        cd "$PROJECT_ROOT/exchange-simulator"
        pip3 install -r requirements.txt
        echo
        echo "[2/4] AI Signal Bot..."
        cd "$PROJECT_ROOT/ai-signal-bot"
        pip3 install -r requirements.txt
        echo
        echo "[3/4] HFT Trade Bot (C++)..."
        cd "$PROJECT_ROOT/hft-trade-bot"
        if command -v cmake &> /dev/null; then
            mkdir -p build && cd build
            cmake .. -DCMAKE_BUILD_TYPE=Release -DUSE_PCH=ON -DUSE_CCACHE=ON -DUSE_UNITY_BUILD=OFF -DWEBSOCKETPP_INCLUDE_DIR="$PROJECT_ROOT/websocketpp"
            make -j$(nproc)
            cd ..
        else
            echo "[WARN] CMake not found. Skipping C++ build."
        fi
        echo
        echo "[4/4] Web UI..."
        cd "$PROJECT_ROOT/web-ui"
        npm install
        echo
        echo "[OK] All dependencies installed."
        cd "$PROJECT_ROOT"
        ;;

    start)
        echo "[INFO] Starting all services..."
        echo

        # Start Exchange Simulator
        echo "[1/4] Starting Exchange Simulator on :8765..."
        cd "$PROJECT_ROOT/exchange-simulator"
        python3 -m exchange_simulator --no-visualizer &
        SIM_PID=$!
        echo "  PID: $SIM_PID"

        sleep 3

        # Start AI Signal Bot
        echo "[2/4] Starting AI Signal Bot on :8766..."
        cd "$PROJECT_ROOT/ai-signal-bot"
        python3 run.py --dashboard --metrics &
        AI_PID=$!
        echo "  PID: $AI_PID"

        sleep 3

        # Start HFT Trade Bot
        echo "[3/4] Starting HFT Trade Bot (C++ engine)..."
        cd "$PROJECT_ROOT/hft-trade-bot"
        if [ -f "build/hft_trade_bot" ]; then
            ./build/hft_trade_bot config/config.yaml &
            HFT_PID=$!
            echo "  PID: $HFT_PID"
        else
            echo "[WARN] HFT Trade Bot binary not found. Build it first: ./no-docker.sh install"
            HFT_PID=""
        fi

        # Start Web UI
        echo "[4/4] Starting Web UI on :3000..."
        cd "$PROJECT_ROOT/web-ui"
        npm run dev &
        UI_PID=$!
        echo "  PID: $UI_PID"

        echo
        echo "[OK] All services started!"
        echo "  - Exchange Simulator:  ws://localhost:8765"
        echo "  - AI Signal Bot:       ws://localhost:8766"
        echo "  - HFT Trade Bot:       C++ engine (connects to :8765 + :8766)"
        echo "  - Web UI:              http://localhost:3000"
        echo
        echo "Press Ctrl+C to stop all services."

        # Trap Ctrl+C to kill all processes
        cleanup() {
            echo
            echo "[INFO] Stopping all services..."
            kill $UI_PID 2>/dev/null || true
            [ -n "$HFT_PID" ] && kill $HFT_PID 2>/dev/null || true
            kill $AI_PID 2>/dev/null || true
            kill $SIM_PID 2>/dev/null || true
            echo "[OK] All services stopped."
            exit 0
        }
        trap cleanup SIGINT SIGTERM

        # Wait for all processes
        wait
        ;;

    stop)
        echo "[INFO] Stopping all trading services..."
        pkill -f "exchange_simulator" 2>/dev/null || true
        pkill -f "run.py.*dashboard" 2>/dev/null || true
        pkill -f "hft_trade_bot" 2>/dev/null || true
        pkill -f "npm.*dev" 2>/dev/null || true
        pkill -f "vite" 2>/dev/null || true
        echo "[OK] All services stopped."
        ;;

    *)
        echo "Usage: ./no-docker.sh [start|stop|install]"
        echo
        echo "  start    - Start all 4 services (default)"
        echo "  stop     - Stop all services"
        echo "  install  - Install all dependencies (Python, C++, Node)"
        ;;
esac
