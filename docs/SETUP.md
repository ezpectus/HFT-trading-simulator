# Setup Guide

## Prerequisites

- **Python 3.12+** (for exchange-simulator and ai-signal-bot)
- **Node.js 20+** (for web-ui)
- **C++20 compiler** (GCC 13+, Clang 17+, or MSVC 19.29+) and **CMake 3.16+** (for hft-trade-bot v2.0)
- **Docker** (optional, for containerized deployment)

## Quick Start (Docker)

```bash
# Clone the repository
git clone https://github.com/yourusername/crypto-trading-simulator.git
cd crypto-trading-simulator

# Start all components
docker-compose up

# View logs
docker-compose logs -f ai-signal-bot
```

## Quick Start (Web UI Only — Mock Mode)

Run the Web UI standalone without any backend services:

```bash
cd web-ui
npm install
VITE_MOCK_MODE=true npm run dev
# Open http://localhost:3000
```

This generates synthetic market data client-side for demo purposes. No Python, C++, or Docker required.

## Manual Setup

### 1. Exchange Simulator

```bash
cd exchange-simulator
pip install -r requirements.txt

# Run with terminal visualizer
python -m exchange_simulator

# Run without visualizer (headless server mode)
python -m exchange_simulator --no-visualizer

# Run in test mode (no visualizer, no WebSocket)
python -m exchange_simulator --headless

# Export data to CSV/Parquet
python -m exchange_simulator --export --export-dir data/exports
python -m exchange_simulator --export --export-format parquet
```

The WebSocket server runs on `ws://localhost:8765`.

### 2. AI Signal Bot

```bash
cd ai-signal-bot
pip install -r requirements.txt

# Run with dashboard
python run.py --dashboard

# Run with custom config
python run.py --config path/to/settings.yaml

# Run backtests
python run_backtest.py --candles 500
python run_backtest.py --plot --output-dir charts/
python run_backtest.py --optimize
python run_backtest.py --db data/trading.db --symbol BTC/USDT
```

### 3. HFT Trade Bot (C++20 v2.0)

#### Build

```bash
cd hft-trade-bot
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```

#### Install dependencies (Ubuntu/Debian)

```bash
sudo apt install -y \
    cmake \
    libboost-dev libboost-system-dev \
    libssl-dev \
    libwebsocketpp-dev \
    libspdlog-dev \
    libfmt-dev \
    nlohmann-json3-dev \
    libyaml-cpp-dev
```

#### V2 Engine (optional, recommended for performance)

The V2 engine requires GCC 13+ or Clang 17+ for full C++20 support. It uses:
- `-O3`, `-flto` (LTO), `-msse4.2`, `-ffast-math` compiler flags
- Cache-line aligned structs (`alignas(64)`)
- Lock-free SPSC queue and object pool (no heap allocations in hot path)

Enable V2 in `config/config.yaml`:
```yaml
signal_engine_v2:
  enabled: true
  weights:
    ema: 0.25
    rsi: 0.15
    obi: 0.20
    vwap: 0.10
    adx: 0.10
    pressure: 0.20
```

Set `enabled: false` to use the V1 fallback engine.

#### Run

```bash
./build/hft_trade_bot config/config.yaml
```

## Running All Components

Open four terminals (or use `start.bat` / `start.sh` which opens 8 windows: 4 services + 4 monitors):

**Terminal 1 — Exchange Simulator:**
```bash
cd exchange-simulator
python -m exchange_simulator
```

**Terminal 2 — AI Signal Bot:**
```bash
cd ai-signal-bot
python run.py --dashboard
```

**Terminal 3 — HFT Trade Bot:**
```bash
cd hft-trade-bot
./build/hft_trade_bot config/config.yaml
```

**Terminal 4 — Web UI:**
```bash
cd web-ui
npm install
npm run dev
# Open http://localhost:3000
```

## Configuration

Each component has its own config file:

| Component | Config File |
|-----------|------------|
| Exchange Simulator | `exchange-simulator/config.yaml` |
| AI Signal Bot | `ai-signal-bot/config/settings.yaml` |
| HFT Trade Bot | `hft-trade-bot/config/config.yaml` |
| Shared settings | `shared_config.yaml` |

### Key parameters to tune:

- **Risk management:** `min_confidence`, `min_rr_ratio`, `max_open_positions`
- **Strategy parameters:** EMA periods, RSI thresholds, BB settings
- **Simulator:** `seed` (reproducibility), `volatility`, `drift`
- **Symbols:** Add/remove trading pairs in config files

## Project Structure

```
crypto-trading-simulator/
├── exchange-simulator/           # Simulated crypto exchange (Python)
│   ├── exchange_simulator/        # Core package
│   │   ├── __init__.py
│   │   ├── __main__.py            # Entry point
│   │   ├── market_simulator.py    # GBM price engine
│   │   ├── exchange.py            # Order matching & account management
│   │   ├── visualizer.py          # Terminal dashboard (ASCII charts)
│   │   ├── websocket_server.py    # WebSocket data feed
│   │   ├── models.py              # Data structures
│   │   ├── arbitrage.py           # Multi-exchange arbitrage detection
│   │   ├── config_validator.py    # Config validation
│   │   └── data_export.py         # CSV/Parquet export
│   ├── tests/                     # pytest tests
│   ├── config.yaml
│   ├── pyproject.toml             # ruff config
│   └── Dockerfile
│
├── ai-signal-bot/                # AI signal generator (Python)
│   ├── src/
│   │   ├── technical_analysis/   # RSI, EMA, MACD, BB, ATR, ADX, VWAP
│   │   ├── strategies/           # Trend, Mean Reversion, FFT, Ensemble
│   │   ├── signal_validation/    # Risk-based filtering
│   │   ├── communication/        # WebSocket client + signal publisher
│   │   ├── database/             # SQLite storage
│   │   ├── monitoring/           # Performance tracking
│   │   ├── risk/                 # Risk manager, Kelly sizing
│   │   └── backtesting/          # Backtester, plotter, optimizer, order book replay
│   ├── tests/                     # pytest tests
│   ├── run.py                    # Main entry point
│   ├── run_backtest.py           # CLI backtest runner
│   ├── config/settings.yaml
│   ├── pyproject.toml            # ruff config
│   └── Dockerfile
│
├── hft-trade-bot/                # HFT execution engine (C++20)
│   ├── src/
│   │   ├── core/                 # Main loop, config, logger
│   │   ├── data/                 # Types, signals
│   │   ├── communication/        # WebSocket signal receiver
│   │   ├── execution/            # Order executor, type selector
│   │   ├── risk/                 # Risk manager
│   │   ├── position/             # Position manager
│   │   └── strategies/           # HFT signal engine (6 indicators)
│   ├── tests/                    # C++ unit tests
│   ├── config/config.yaml
│   ├── CMakeLists.txt
│   └── Dockerfile
│
├── web-ui/                       # Browser dashboard (React 18)
│   ├── src/
│   │   ├── components/           # 201+ UI components (191+ registered panels)
│   │   ├── panels/               # Panel registry + container (ErrorBoundary + Suspense)
│   │   ├── hooks/                # WebSocket, exchange data, signals, theme, sound, detachable
│   │   └── utils/                # Indicators, performance, format, timeframes, patterns
│   ├── .env.example              # WebSocket URL + mock mode configuration
│   ├── netlify.toml              # Netlify deployment config
│   ├── .eslintrc.json            # ESLint configuration
│   ├── Dockerfile                # Multi-stage (node build + nginx serve)
│   ├── nginx.conf                # SPA routing + caching
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── docs/                         # Documentation (12 files)
├── .github/                      # CI workflows + issue/PR templates
├── logs/                         # Timestamped log files (auto-created)
├── docker-compose.yml            # 4-service orchestration
├── shared_config.yaml            # Global settings
├── Makefile                      # install, dev, test, test-js, lint, build, docker, logs
├── start.bat / start.sh          # Quick-start scripts (8 windows: 4 services + 4 monitors)
├── .editorconfig                 # IDE coding style
├── .gitignore
├── CHANGELOG.md
├── CONTRIBUTING.md
├── README.md
└── LICENSE                       # Apache 2.0
```

## Troubleshooting

### WebSocket connection refused
- Ensure the exchange simulator is running first
- Check that port 8765 is not in use: `netstat -tlnp | grep 8765`
- Check that port 8766 is not in use (AI signal bot)

### C++ build errors
- Ensure all dependencies are installed (see Install dependencies section)
- Use GCC 10+, Clang 12+, or MSVC 19.29+ for C++20 support

### No signals generated
- Check that candle history is sufficient (minimum 30 candles for standard strategies, 64 for FFT)
- Lower `min_confidence` in config to see more signals
- Check logs for rejection reasons

### Visualizer not displaying
- Use a terminal that supports ANSI colors
- On Windows, use Windows Terminal or PowerShell

### Web UI shows no data
- Check WebSocket status indicators in the header (green = connected)
- Verify exchange simulator is broadcasting
- Check `.env` file WebSocket URLs (see `web-ui/.env.example`)
- WebSocket uses exponential backoff (1s -> 30s cap)
- Try mock mode: `VITE_MOCK_MODE=true npm run dev` to verify UI works without backend

### npm install fails
- Ensure Node.js 20+ is installed: `node --version`
- Delete `node_modules/` and retry: `npm cache clean --force && npm install`

### Finding log files
- All services write timestamped logs to `logs/` directory
- `logs/<service>_latest.log` — symlink to most recent log
- `logs/trades_latest.csv` — symlink to most recent trade CSV
- Use `make logs` to view latest log files for all services

### CLI Monitor Scripts
- `ai-signal-bot/monitor.py` — live signal feed and bot log tail
- `hft-trade-bot/monitor.py` — C++ process status and color-coded log tail
- `error_monitor.py` — unified error+warning viewer across all services
- `price_monitor.py` — dual WS connection, live prices + signals + fills
