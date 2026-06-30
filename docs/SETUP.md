# Setup Guide

## Prerequisites

- **Python 3.12+** (for exchange-simulator and ai-signal-bot)
- **Node.js 20+** (for web-ui)
- **C++20 compiler** (GCC 10+, Clang 12+, or MSVC 19.29+) and **CMake 3.16+** (for hft-trade-bot)
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

### 3. HFT Trade Bot (C++)

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

#### Run

```bash
./build/hft_trade_bot config/config.yaml
```

## Running All Components

Open four terminals (or use `start.bat` / `start.sh`):

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
│   │   ├── components/           # 90+ UI components
│   │   ├── panels/               # Panel registry + container
│   │   ├── hooks/                # WebSocket, exchange data, signals, theme, sound
│   │   └── utils/                # Indicators, performance, format, timeframes, patterns
│   ├── .env.example              # WebSocket URL configuration
│   ├── Dockerfile                # Multi-stage (node build + nginx serve)
│   ├── nginx.conf                # SPA routing + caching
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── docs/                         # Documentation (10 files)
├── .github/                      # CI templates + workflows
├── docker-compose.yml            # 4-service orchestration
├── shared_config.yaml            # Global settings
├── Makefile                      # install, dev, test, lint, build, docker
├── start.bat / start.sh          # Quick-start scripts (Windows/Linux)
├── .editorconfig                 # IDE coding style
├── .gitignore
├── CHANGELOG.md
├── CONTRIBUTING.md
├── README.md
└── LICENSE
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
- WebSocket uses exponential backoff (1s → 30s cap)

### npm install fails
- Ensure Node.js 20+ is installed: `node --version`
- Delete `node_modules/` and retry: `npm cache clean --force && npm install`
