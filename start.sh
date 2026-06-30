#!/bin/bash
# ============================================================
#  Crypto Trading Simulator — Start All Services
#  Opens 3 terminal tabs + Web UI
# ============================================================

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting Crypto Trading Simulator..."

# Terminal 1: Exchange Simulator
gnome-terminal --tab --title="Exchange Simulator" -- bash -c "
  cd '$ROOT_DIR/exchange-simulator'
  python -m exchange_simulator --no-visualizer
  exec bash
" 2>/dev/null || xterm -title "Exchange Simulator" -e "
  cd '$ROOT_DIR/exchange-simulator' && python -m exchange_simulator --no-visualizer
" &

sleep 3

# Terminal 2: AI Signal Bot
gnome-terminal --tab --title="AI Signal Bot" -- bash -c "
  cd '$ROOT_DIR/ai-signal-bot'
  python run.py --dashboard
  exec bash
" 2>/dev/null || xterm -title "AI Signal Bot" -e "
  cd '$ROOT_DIR/ai-signal-bot' && python run.py --dashboard
" &

sleep 3

# Terminal 3: HFT Trade Bot (C++)
if [ -f "$ROOT_DIR/hft-trade-bot/build/hft_trade_bot" ]; then
    gnome-terminal --tab --title="HFT Trade Bot" -- bash -c "
      cd '$ROOT_DIR/hft-trade-bot'
      ./build/hft_trade_bot config/config.yaml
      exec bash
    " 2>/dev/null || xterm -title "HFT Trade Bot" -e "
      cd '$ROOT_DIR/hft-trade-bot' && ./build/hft_trade_bot config/config.yaml
    " &
else
    echo "[WARNING] HFT Trade Bot not built."
    echo "  Run: cd hft-trade-bot && mkdir build && cd build && cmake .. && make -j\$(nproc)"
fi

# Terminal 4: Web UI
gnome-terminal --tab --title="Web UI" -- bash -c "
  cd '$ROOT_DIR/web-ui'
  npm run dev
  exec bash
" 2>/dev/null || xterm -title "Web UI" -e "
  cd '$ROOT_DIR/web-ui' && npm run dev
" &

sleep 5

# Terminal 5: AI Signal Bot Monitor (live signal feed + bot status)
gnome-terminal --tab --title="AI Signal Bot Monitor" -- bash -c "
  cd '$ROOT_DIR/ai-signal-bot'
  python monitor.py
  exec bash
" 2>/dev/null || xterm -title "AI Signal Bot Monitor" -e "
  cd '$ROOT_DIR/ai-signal-bot' && python monitor.py
" &

# Terminal 6: HFT Trade Bot Monitor (C++ engine status + log tail)
gnome-terminal --tab --title="HFT Trade Bot Monitor" -- bash -c "
  cd '$ROOT_DIR/hft-trade-bot'
  python monitor.py
  exec bash
" 2>/dev/null || xterm -title "HFT Trade Bot Monitor" -e "
  cd '$ROOT_DIR/hft-trade-bot' && python monitor.py
" &

# Terminal 7: Unified Error Monitor (errors + warnings from all services)
gnome-terminal --tab --title="Error Monitor" -- bash -c "
  cd '$ROOT_DIR'
  python error_monitor.py
  exec bash
" 2>/dev/null || xterm -title "Error Monitor" -e "
  cd '$ROOT_DIR' && python error_monitor.py
" &

# Terminal 8: Price & Signal Monitor (live crypto prices + strategy signals)
gnome-terminal --tab --title="Price & Signal Monitor" -- bash -c "
  cd '$ROOT_DIR'
  python price_monitor.py
  exec bash
" 2>/dev/null || xterm -title "Price & Signal Monitor" -e "
  cd '$ROOT_DIR' && python price_monitor.py
" &

echo ""
echo "All services started:"
echo "  1. Exchange Simulator      - ws://localhost:8765"
echo "  2. AI Signal Bot           - ws://localhost:8766"
echo "  3. HFT Trade Bot           - C++ engine"
echo "  4. Web UI                  - http://localhost:3000"
echo "  5. AI Signal Bot Monitor   - live signal feed"
echo "  6. HFT Trade Bot Monitor   - C++ engine status"
echo "  7. Error Monitor           - unified error viewer"
echo "  8. Price & Signal Monitor  - live prices + signals"
echo ""
echo "Close the terminal windows to stop each service."
