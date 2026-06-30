# Crypto Trading Simulator

![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.12+-yellow.svg)
![C++](https://img.shields.io/badge/C%2B%2B-20-blue.svg)
![React](https://img.shields.io/badge/React-18-61dafb.svg)
![Vite](https://img.shields.io/badge/Vite-5-646cff.svg)
![Docker](https://img.shields.io/badge/Docker-ready-2496ed.svg)

> **A complete crypto trading floor in your browser — simulated exchange, AI analyst, HFT bot, and 90+ dashboard panels. Zero real money, zero risk, 100% educational.**

### What is this?

Imagine you could walk into a crypto trading firm, sit down at a desk with three monitors, and trade on Binance, Bybit, and OKX — all at once, with real-time charts, an AI whispering buy/sell signals in your ear, and a high-frequency bot executing trades in milliseconds.

**That's what this project does — except nothing is real.** No exchange API keys, no real money, no risk. Every price is synthetically generated, every order is simulated, every fill is fake. It's a **paper trading sandbox** designed for learning, experimenting, and building.

### Why would I want this?

- **Curious about trading?** — Try it without risking a cent. Place market orders, set stop-losses, watch the order book, see how funding rates eat your position.
- **Learning to code?** — Study a real system with Python, C++20, and React working together over WebSocket. 4 independent services, clean architecture, 90+ UI components.
- **Building your own bot?** — Use the backtesting engine, study the 8-stage signal pipeline, experiment with FFT cycle analysis, Kelly criterion sizing, and ensemble voting.
- **Just want to play?** — Open the dashboard, watch candles move, place orders, trigger news events, see liquidations, hunt for arbitrage. It's fun.

### How does it work?

Four programs talk to each other in real-time:

| Program | What it does | Language |
|---------|-------------|----------|
| **Exchange Simulator** | Pretends to be 3 crypto exchanges — generates realistic prices, order books, handles your orders, charges fees, pays funding, liquidates overleveraged positions, and even simulates news events that move the market | Python |
| **AI Signal Bot** | Acts like a trading analyst — watches the market, runs 8 analysis stages (technical indicators, trend detection, mean reversion, FFT cycles, ensemble voting), and broadcasts buy/sell signals with confidence scores | Python |
| **HFT Trade Bot** | Acts like a high-frequency trader — reads the order book microstructure, generates signals from 6 indicators in microseconds, and executes arbitrage when it spots price gaps between exchanges | C++20 |
| **Web UI** | Acts like your trading terminal — TradingView-style charts, order book with heatmap, 90+ analytical panels (risk, portfolio, order flow, technical analysis), backtest runner, and bot status monitoring | React |

All communication happens over WebSocket (real-time bidirectional JSON messages). You open `http://localhost:3000` in your browser and everything just works.

### Is it safe?

**Yes.** This is 100% simulation:
- No real exchange API is ever called
- No real money is involved
- No real orders are placed
- All market data is synthetically generated using mathematical models (Geometric Brownian Motion)
- The seed is configurable, so you can reproduce the exact same market conditions every time

---

## Quick Start

### Prerequisites

- **Python 3.12+** — for exchange-simulator and ai-signal-bot
- **Node.js 20+** — for web-ui (`node --version` to check)
- **C++20 compiler** (GCC 10+, Clang 12+, or MSVC 19.29+) and **CMake 3.16+** — for hft-trade-bot
- **Docker** (optional, for containerized deployment)

### Option 1: Docker (recommended)

```bash
docker-compose up
```

Then open **http://localhost:3000** in your browser. That's it.

- Exchange Simulator: `ws://localhost:8765`
- AI Signal Bot: `ws://localhost:8766`
- Web UI Dashboard: `http://localhost:3000`

### Option 2: Manual

```bash
# Install all dependencies
make install

# Or install individually:
cd exchange-simulator && pip install -r requirements.txt && cd ..
cd ai-signal-bot && pip install -r requirements.txt && cd ..
cd web-ui && npm install && cd ..

# Quick start — opens 3 CLI windows + Web UI
# Windows:
start.bat
# Linux:
./start.sh

# Or run each service manually:

# Terminal 1: Exchange simulator
cd exchange-simulator
python -m exchange_simulator

# Terminal 2: AI signal bot
cd ai-signal-bot
python run.py --dashboard

# Terminal 3: HFT trade bot (requires C++20 compiler)
cd hft-trade-bot
mkdir build && cd build && cmake .. && make -j$(nproc)
./hft_trade_bot ../config/config.yaml

# Terminal 4: Web UI
cd web-ui
npm run dev
# Open http://localhost:3000
```

---

## Features

### Exchange Simulator
- **Geometric Brownian Motion** price generation with per-symbol volatility
- 3 simulated exchanges (Binance, Bybit, OKX) with different fee structures and slippage
- 3 trading pairs: BTC/USDT, ETH/USDT, SOL/USDT
- Simulated order book with 20 depth levels, decay-based liquidity
- Market and limit order matching engine with slippage simulation
- Account simulation with balance, positions, PnL, win rate
- **Multi-exchange arbitrage detection** — scans order books, broadcasts opportunities via WebSocket
- **Per-exchange funding rates** — charged to positions every 8h equivalent
- **Partial fill simulation** — large orders split across order book levels
- **Market impact model** — large orders move price
- **Order rejection reasons** — insufficient margin, max position size, no price data
- **News event simulation** — sudden volatility spikes with directional bias
- **Liquidation engine** — auto-close positions when margin < maintenance
- **Holiday/weekend mode** — reduced volatility, auto-detect
- **Config hot-reload** — change volatility/fees without restart
- **Data export** — CSV and Parquet formats for candles, orders, accounts, positions
- **Tabbed terminal visualizer** (TradingView-style):
  - Tabs: `[1] BTC` `[2] ETH` `[3] SOL` `[A] Account`
  - ASCII candle charts with color-coded bullish/bearish candles
  - Volume bars, RSI mini-chart, MACD histogram, Bollinger Bands position
  - FFT regime detection (TRENDING / RANGING / MIXED)
  - Order book depth visualization (10 levels bid/ask)
  - Account tab: balance, equity, PnL, open positions, order history
  - Arrow key navigation + number key shortcuts
- WebSocket server streaming market data with order book snapshots
- Reproducible mode (configurable random seed)
- Config validation module with comprehensive error checking

### AI Signal Bot
- **8-stage signal generation pipeline** (Data Collection → Technical Analysis → Trend Following → Mean Reversion → FFT Cycle → Ensemble Voter → Signal Validation → Order Execution)
- Technical indicators: RSI, EMA, SMA, MACD, Bollinger Bands, ATR, ADX, VWAP
- **Trend Following** strategy (EMA crossover + ADX filter)
- **Mean Reversion** strategy (RSI extremes + Bollinger Bands)
- **FFT Cycle** strategy (spectral analysis, cycle detection, regime classification: TRENDING/RANGING/MIXED)
- **Ensemble Voter** (majority or confidence-weighted, 3 strategies)
- Signal validation with risk checks (confidence, R:R, drawdown, position limits)
- **Signal Publisher** (WebSocket :8766) — broadcasts validated signals + market regime + backtest endpoint
- SQLite database for signals, trades, and equity curve
- CSV logging for signals and trades
- Terminal dashboard with performance metrics
- **Backtesting engine** — historical replay with fee/slippage modeling, drawdown analysis, recovery factor, Calmar ratio, multi-strategy comparison
- **Equity curve plotting** (matplotlib) — drawdown shading, trade PnL distribution, strategy comparison, radar charts
- **Strategy parameter optimization** — grid search with walk-forward validation, 4 fitness functions
- **Kelly Criterion position sizing** — optimal bet size from win rate and payoff ratio
- **Order book replay** — synthetic L2 order book generation from OHLCV candles for backtesting OBI/pressure strategies
- **Risk manager** — trailing stop loss (fixed % or ATR-based), breakeven moves, partial take profit, max hold time
- **Backtest WebSocket endpoint** — run backtests from Web UI, compare strategy equity curves

### HFT Trade Bot
- C++20 with low-latency signal generation
- **HFT Signal Engine** (6 indicators):
  - EMA crossover (fast/slow)
  - Order Book Imbalance (OBI)
  - VWAP deviation
  - Price Pressure Model (volume-weighted body direction)
  - **FFT spectral trend score** (low-freq vs high-freq energy)
  - **FFT smoothed price direction** (low-pass filtered slope)
- Smart order type selector (market vs limit based on spread and confidence)
- Thread-safe position manager with automatic SL/TP monitoring
- Pre-trade risk manager with position sizing
- **Arbitrage execution** — simultaneous buy+sell when spread > threshold
- WebSocket client for market data, order execution, and AI signal reception
- spdlog for high-performance logging
- Config validation with range checks for all parameters

### Web UI Dashboard
- React 18 + Vite 5 + TailwindCSS 3 (dark/light theme toggle)
- **90+ analytical panels** organized in 7 categories via panel registry system
- **TradingView-style candle charts** (lightweight-charts) with volume histogram
- **Chart indicators** — EMA 9/21/50, Bollinger Bands, RSI 14, VWAP (toggle on/off)
- **Multi-timeframe charts** — 5m/15m/1h/4h toggle (frontend aggregation)
- **Alternative chart modes** — Heikin-Ashi, Renko, Point & Figure, Kagi, Three-Line Break, Tick, Volume Clock
- **Binance-style order book** with real WebSocket data, depth bars, heatmap, and cumulative totals
- **Order form** — market/limit, SL/TP, live notional, quick-trade buttons (25/50/75/100%), per-exchange fee breakdown
- **Account panel** — balance, equity, PnL, fees, win rate per exchange, PnL leaderboard, mini PnL bars
- **Positions panel** — open positions with unrealized PnL, liquidation price, leverage badge, SL/TP progress bar, close button
- **AI signal feed** — real-time signals with confidence, R:R, regime, confidence distribution histogram
- **Arbitrage panel** — active cross-exchange opportunities with spread, estimated profit
- **Fills panel** — recent order fill history with fill statistics
- **Performance dashboard** — aggregate metrics, per-exchange breakdown, equity curve, drawdown chart, signal stats, Sharpe/Sortino ratios, win/loss streaks
- **Backtest runner** — run strategies on synthetic data, compare equity curves, risk options (trailing/breakeven)
- **Trade history** — closed trades with PnL, SL/TP reason, summary stats, CSV export
- **Bot status panel** — AI bot + HFT bot status cards, portfolio overview, combined activity feed
- **Order flow panels** — CVD, order flow tape, depth chart, spoofing detector, dark order flow, order flow imbalance
- **Technical analysis panels** — Fibonacci, FVG, pattern detector/scanner, support/resistance, order blocks, candle patterns
- **Risk & analytics panels** — Monte Carlo, drawdown analysis, risk dashboard (VaR/CVaR/beta), Kelly calculator, risk parity, Greeks calculator, volatility surface, hedging suggestions, correlation matrix, position correlation, P&L attribution
- **Portfolio panels** — portfolio optimizer (Markowitz), auto-rebalance, multi-account view, session stats, heatmap calendar, time-of-day performance, trade clustering
- **Strategy panels** — strategy builder (visual rule-based), execution bot (TWAP/VWAP), walk-forward analysis, alert webhook, watchlist, signal performance tracking
- **Export panels** — session export (JSON), trade stats export (CSV), trade journal with tags
- **Config panel** — hot-reload simulator parameters
- **Price alerts** — user-set threshold prices with toast + sound notifications
- **Smart order router** — best price across exchanges
- **Multi-monitor support** — detachable panels via popup windows with live data
- **Onboarding tutorial** — first-run guide
- **Keyboard shortcuts** — 1/2/3 switch exchange, Q/W/E switch symbol, Space pause, ? for help
- **Simulation speed control** — Pause/1x/2x/5x buttons, spacebar toggle
- **Toast notifications** — connection changes, fills, strong signals, news events
- **Sound alerts** — fills, SL/TP hits, connection changes (Web Audio API)
- **Mobile-responsive layout** — panel toggle, responsive header/footer
- WebSocket auto-reconnect with exponential backoff and live status indicators
- Docker support (port 3000, multi-stage build with nginx)

---

## Architecture

```
┌──────────────────────────┐     WebSocket (JSON)
│  Exchange Simulator      │ ─────────────────────────┐
│  (Python asyncio)        │                          │
│  • GBM price generation  │                          ▼
│  • 3 exchanges           │           ┌──────────────────────────┐
│  • Order book simulation │           │  AI Signal Bot (Python)   │
│  • Account simulation    │           │                           │
│  • Arbitrage detection   │           │  8-Stage Pipeline:        │
│  • Funding rates         │           │  1. Data Collection       │
│  • News events           │           │  2. Technical Analysis    │
│  • Liquidation engine    │           │  3. Trend Following       │
│  • Market impact model   │           │  4. Mean Reversion        │
│                          │           │  5. FFT Cycle Strategy    │
│  WebSocket :8765         │           │  6. Ensemble Voter        │
└──────────────────────────┘           │  7. Signal Validation     │
        ▲                              │  8. Order Execution       │
        │     Orders (WebSocket)       │                           │
        │                              │  Risk Manager             │
        │                              │  Backtest Engine          │
        │                              │  SQLite (trading.db)      │
        │                              │  Signal Publisher :8766   │
        │                              └──────────────┬───────────┘
        │                                             │
        │     Orders (WebSocket)                      │ AI Signals (WebSocket :8766)
        │                                             │
        │              ┌──────────────────────────────┘
        └──────────────│  HFT Trade Bot (C++20)    │
                       │  • Signal Engine (6 ind.) │
                       │  • Risk Manager           │
                       │  • Position Manager       │
                       │  • Order Type Selector    │
                       │  • Arbitrage Execution    │
                       └──────────────────────────┘

┌──────────────────────────┐
│  Web UI Dashboard        │
│  (React 18 + Vite)       │
│                          │     WebSocket :8765 (exchange)
│  • 90+ analytical panels │ ◄── WebSocket :8766 (signals)
│  • Candle Charts (TV)    │
│  • Order Book + Form     │
│  • Performance Dashboard │
│  • Backtest Runner       │
│  • Panel Registry System │
│                          │
│  HTTP :3000              │
└──────────────────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

---

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make install` | Install all Python + Node dependencies |
| `make dev` | Start all services via Docker Compose |
| `make dev-exchange` | Start only exchange simulator (headless) |
| `make dev-signals` | Start only AI signal bot |
| `make dev-ui` | Start only Web UI (development mode) |
| `make test` | Run all Python tests (exchange + AI bot) |
| `make test-exchange` | Run exchange simulator tests only |
| `make test-signals` | Run AI signal bot tests only |
| `make lint` | Run ruff linter on all Python code |
| `make build` | Build Web UI for production |
| `make docker-up` | Build and start all Docker containers |
| `make docker-down` | Stop all Docker containers |
| `make clean` | Remove build artifacts and caches |

---

## CLI Monitor Windows

`start.bat` (Windows) and `start.sh` (Linux) open 8 terminal windows:

### Service Windows (4)
| # | Window | Description |
|---|--------|-------------|
| 1 | Exchange Simulator | Python exchange engine (ws://localhost:8765) |
| 2 | AI Signal Bot | Python signal bot with dashboard (ws://localhost:8766) |
| 3 | HFT Trade Bot | C++ HFT engine (requires build) |
| 4 | Web UI | Vite dev server (http://localhost:3000) |

### Monitor Windows (4)
| # | Window | Script | Description |
|---|--------|--------|-------------|
| 5 | AI Signal Bot Monitor | `ai-signal-bot/monitor.py` | Live signal feed via WS, bot log tail, signal history |
| 6 | HFT Trade Bot Monitor | `hft-trade-bot/monitor.py` | C++ process status, log tail with color-coded errors/warnings |
| 7 | Error Monitor | `error_monitor.py` | Unified error+warning viewer across all 3 service logs |
| 8 | Price & Signal Monitor | `price_monitor.py` | Live crypto prices (exchange WS) + trading signals (signal WS) + recent fills |

All monitors auto-reconnect with exponential backoff. Color-coded output:
- **Green** — LONG signals, BUY fills, CONNECTED, info
- **Red** — SHORT signals, SELL fills, errors, DISCONNECTED
- **Yellow** — warnings, neutral signals, mid-range prices

---

## Technology Stack

| Component | Language | Key Libraries |
|-----------|----------|--------------|
| Exchange Simulator | Python 3.12 | asyncio, websockets, pyyaml, numpy |
| AI Signal Bot | Python 3.12 | asyncio, websockets, sqlite3, numpy, matplotlib |
| HFT Trade Bot | C++20 | Boost, websocketpp, spdlog, fmt, nlohmann/json, yaml-cpp |
| Web UI | JavaScript | React 18, Vite 5, TailwindCSS 3, lightweight-charts 4, lucide-react |
| Communication | - | WebSocket (JSON), per-message deflate compression |
| Database | - | SQLite (WAL mode) |
| Containerization | - | Docker, docker-compose |
| CI/CD | - | GitHub Actions (Python tests, C++ build, Web UI build, Docker) |
| Linting | - | ruff (Python), per-file ignores for tests |

---

## Configuration

Each component has its own YAML config file:

| Component | Config |
|-----------|--------|
| Exchange Simulator | [`exchange-simulator/config.yaml`](exchange-simulator/config.yaml) |
| AI Signal Bot | [`ai-signal-bot/config/settings.yaml`](ai-signal-bot/config/settings.yaml) |
| HFT Trade Bot | [`hft-trade-bot/config/config.yaml`](hft-trade-bot/config/config.yaml) |
| Shared | [`shared_config.yaml`](shared_config.yaml) |

Key parameters to tune:
- `min_confidence` — Minimum signal confidence (default: 65)
- `min_rr_ratio` — Minimum reward/risk ratio (default: 1.5)
- `max_open_positions` — Maximum simultaneous positions (default: 3)
- `seed` — Random seed for reproducible simulation (default: 42)

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — System design, component overview, data flow
- [Architecture Roadmap](docs/ARCHITECTURE_ROADMAP.md) — 5–20 year sustainability plan
- [Trading Strategies](docs/TRADING_STRATEGIES.md) — Strategy details, parameters, risk management
- [WebSocket Protocol](docs/WEBSOCKET_PROTOCOL.md) — All message types and data formats
- [Web UI](docs/WEB_UI.md) — Browser dashboard guide, components, layout
- [Exchange Simulator](docs/EXCHANGE_SIMULATOR.md) — Price generation, order book, account simulation
- [Setup Guide](docs/SETUP.md) — Installation and running instructions
- [Progress & Roadmap](docs/PROGRESS.md) — Implementation history and planned features
- [Future TODO](docs/FUTURE_TODO.md) — Feature backlog with priority levels
- [Code Audit](docs/AUDIT_2025.md) — Kleppmann principles audit, issues found and fixed

---

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

---

## Troubleshooting

### WebSocket connection refused
- Ensure exchange simulator is running first: `python -m exchange_simulator --no-visualizer`
- Ensure AI signal bot is running: `python run.py --dashboard`
- Check ports 8765 (exchange) and 8766 (signals) are not in use
- Verify firewall allows localhost WebSocket connections

### Web UI shows no data
- Check WebSocket status indicators in the header (green = connected)
- Verify exchange simulator is broadcasting (check terminal output for client connections)
- Web UI defaults to `ws://localhost:8765` and `ws://localhost:8766` — override with `.env` file (see `web-ui/.env.example`)
- WebSocket uses exponential backoff for reconnection (1s → 2s → 4s → 8s → 16s → 30s cap)

### npm install fails
- Ensure Node.js 20+ is installed: `node --version`
- Delete `node_modules/` and `package-lock.json` if present, then retry
- Try: `npm cache clean --force && npm install`

### C++ build fails
- Install dependencies: `sudo apt-get install cmake libboost-dev libboost-system-dev libssl-dev libwebsocketpp-dev libspdlog-dev libfmt-dev nlohmann-json3-dev libyaml-cpp-dev`
- Ensure C++20 compatible compiler (GCC 10+, Clang 12+, MSVC 19.29+)

### Docker build fails
- Ensure Docker has sufficient memory (4GB+ recommended)
- Try: `docker-compose build --no-cache`

### Python tests fail
- Install test dependencies: `pip install pytest pytest-asyncio`
- Run from component directory: `cd exchange-simulator && python -m pytest tests/ -v`
- For AI signal bot: `cd ai-signal-bot && python -m pytest tests/ -v`

### No signals generated
- Check that candle history is sufficient (minimum 30 candles for standard strategies, 64 for FFT)
- Lower `min_confidence` in config to see more signals
- Check logs for rejection reasons

### Visualizer not displaying
- Use a terminal that supports ANSI colors
- On Windows, use Windows Terminal or PowerShell

---

## Disclaimer

This is a **paper trading simulator** for educational purposes. No real exchange API is used, no real money is involved, and no financial advice is provided. All market data is synthetically generated.

---

## License

Apache License 2.0 — See [LICENSE](LICENSE)

This project is licensed under Apache 2.0 for educational and informational purposes. You are free to use, modify, and distribute this project, provided you:

1. **Retain** the original copyright notice and license file
2. **Credit** the original author in your README or documentation
3. **Include** a link to the original repository

> "Based on Crypto Trading Simulator (Lite) by [your name/GitHub username]"

This is **not** financial advice. This is **not** a trading bot for real exchanges. No real money is involved.
