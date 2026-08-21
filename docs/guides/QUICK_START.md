# Quick Start Guide

Get the HFT Trading System running in under 10 minutes.

## Theory: What happens at startup

### What starts when you run `docker-compose up`

4 services start simultaneously:

1. **Exchange Simulator (port 8765):** Generates synthetic market
   data (GBM + Student-t + Merton jumps). WebSocket server broadcasts
   candles, order books, fills. 50 symbols, 3 exchanges.

2. **AI Signal Bot (port 8766):** Connects to Exchange Simulator,
   receives candles. Runs 5+ strategies (trend, meanrev, fft, statarb,
   sentiment). EnsembleVoter combines signals. Publishes to WebSocket.

3. **HFT Trade Bot (port 9091):** Connects to both Exchange Simulator
   (market data) and AI Signal Bot (signals). Signal Engine V2 generates
   fast-path signals. Smart Order Router executes orders.

4. **Web UI (port 3000):** Connects to Exchange Simulator + AI Signal
   Bot. Real-time candlestick charts, order book, signals, backtesting.

### Why Docker is recommended

**Docker Compose:** One command starts all 4 services. Isolated
environment. Reproducible. No "works on my machine" problems.
Network = Docker bridge (services find each other by name).

**Without Docker:** Need Python 3.12, Node.js 22, C++ compiler,
CMake — all installed. Manual dependency management. Platform-specific
issues. Multiple terminal windows.

---

## Prerequisites

| Requirement | Version | Needed for |
|-------------|---------|------------|
| Python | 3.12+ | Exchange Simulator, AI Signal Bot |
| Node.js | 22+ | Web UI |
| C++ compiler | GCC 13+ / Clang 17+ / MSVC 19.29+ | HFT Trade Bot (optional) |
| CMake | 3.16+ | HFT Trade Bot (optional) |
| Docker | 20.10+ | Containerized deployment (optional) |
| Git | any | Cloning the repo |

---

## Option 1: Docker (Recommended)

```bash
git clone https://github.com/ezpectus/HFT-trading-simulator.git
cd HFT-trading-simulator
docker-compose up -d
```

Services start automatically:

| Service | URL | Port |
|---------|-----|------|
| Exchange Simulator | `ws://localhost:8765` | 8765 |
| AI Signal Bot | `ws://localhost:8766` | 8766 |
| Web UI | `http://localhost:3000` | 3000 |

**View logs:**
```bash
docker-compose logs -f ai-signal-bot
docker-compose logs -f exchange-simulator
```

**Stop:**
```bash
docker-compose down
```

---

## Option 2: Manual Setup (All 4 Components)

### Step 1: Install Dependencies

```bash
# Exchange Simulator
cd exchange_simulator
pip install -r requirements.txt

# AI Signal Bot
cd ../ai-signal-bot
pip install -r requirements.txt

# Web UI
cd ../web-ui
npm install

# HFT Trade Bot (optional, requires C++20)
cd ../hft-trade-bot
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build . -j$(nproc)
```

### Step 2: Start Exchange Simulator

```bash
cd exchange_simulator
python -m exchange_simulator
```

Wait for `WebSocket server started on :8765` in the logs.

### Step 3: Start AI Signal Bot

```bash
cd ai-signal-bot
python run.py
```

The bot connects to the exchange simulator and begins generating signals.

### Step 4: Start HFT Trade Bot (Optional)

```bash
cd hft-trade-bot/build
./hft_trade_bot
```

Connects to both exchange simulator (for market data) and AI signal bot (for signals)
via WebSocket and shared memory.

### Step 5: Start Web UI

```bash
cd web-ui
npm run dev
```

### Step 6: Open Dashboard

Navigate to `http://localhost:3000`

---

## Option 3: Web UI Only (Mock Mode)

Run the dashboard without any backend — generates synthetic data client-side:

```bash
cd web-ui
cp .env.mock .env
npm install
npm run dev
```

Open `http://localhost:3000`. No Python, C++, or Docker required.

---

## Option 4: Windows Quick Start

```bat
REM Install all dependencies
install-deps.bat

REM Start all services
no-docker.bat
```

Or use the provided scripts:
```bat
REM Using docker
docker.bat up

REM Without docker
no-docker.bat start
```

---

## Option 5: Linux/macOS Quick Start

```bash
# Install dependencies
./no-docker.sh install

# Start all services
./no-docker.sh start

# Stop
./no-docker.sh stop
```

---

## Verify Installation

1. **Web UI** — Open `http://localhost:3000`, you should see the trading dashboard
2. **Connection banners** — Green = connected, red = disconnected
3. **Select exchange** — Binance, Bybit, or OKX from the header dropdown
4. **Select symbol** — BTC/USDT or any of the 50 available pairs
5. **View data** — Candlestick chart, order book, and signals should appear in real-time
6. **Check signals** — Navigate to the Signals tab to see AI-generated trading signals

---

## Production Deployment

```bash
# Copy production environment template
cp .env.prod.example .env.prod
# Edit .env.prod with your settings

# Start production stack (includes PostgreSQL, Redis, Prometheus, Grafana)
docker-compose -f docker-compose.prod.yml up -d

# Or via Makefile
make -f Makefile.prod prod-up
```

See [Deployment Guide](../DEPLOYMENT.md) for full production instructions.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ModuleNotFoundError: No module named 'numpy'` | Run `pip install -r requirements.txt` in the component directory |
| `Connection refused` on port 8765 | Exchange Simulator not running — start it first |
| Web UI shows red banners | Backend services not running — check Docker/processes |
| `npm ERR!` during install | Ensure Node.js 22+ — check with `node --version` |
| C++ build fails | Ensure C++20 compiler — check with `g++ --version` or `clang++ --version` |
| Port already in use | Stop the process using the port or change the port in config |
| Docker containers keep restarting | Check logs with `docker-compose logs <service>` |
| No signals appearing | Check AI Signal Bot logs — may need 60s for first signal cycle |

---

## Next Steps

- [Configuration Guide](./CONFIGURATION_GUIDE.md) — Customize trading parameters, strategies, risk
- [Trading Guide](./TRADING_GUIDE.md) — Learn to use the dashboard, place orders, run backtests
- [Development Guide](./DEVELOPMENT_GUIDE.md) — Extend the system, add strategies, contribute
- [Architecture](../ARCHITECTURE.md) — Understand the system design
