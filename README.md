# HFT Trading System

![CI](https://img.shields.io/github/actions/workflow/status/ezpectus/HFT-TradeBot--Lite-version/ci.yml?branch=main&label=CI)
[![codecov](https://codecov.io/gh/ezpectus/HFT-TradeBot--Lite-version/branch/main/graph/badge.svg)](https://codecov.io/gh/ezpectus/HFT-TradeBot--Lite-version)
![Version](https://img.shields.io/badge/version-2.2.0-blue.svg)
![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)

Educational high-frequency trading simulator v2.2.0. C++20 signal engine, Python quant models, shared-memory IPC. Zero real money — 100% for learning.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    HFT TRADING SYSTEM                            │
├──────────────┬──────────────┬────────────────────────────────────┤
│  EXCHANGE    │  AI SIGNAL   │  HFT TRADE                         │
│  SIMULATOR   │  BOT         │  BOT                               │
│  (Python)    │  (Python)    │  (C++20)                           │
│              │              │                                    │
│  49 symbols  │  7 strategies│  Signal V2/V3                      │
│  3 exchanges │  signal loop │  HMM regime                        │
│  GBM + jumps │  Backtesting │  SHM IPC                           │
│  Order book  │  Risk mgmt   │  lock-free                         │
│  Options     │              │  zero-alloc                        │
└──────┬───────┴──────┬───────┴──────┬─────────────────────────────┘
       │ WS :8765     │ SHM ~30us    │ WS orders
       │              │              │
       ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────────┐
│                    WEB UI (React 18)                             │
│  ~290 panels · PWA · WCAG AA · WebSocket :3000                   │
└──────────────────────────────────────────────────────────────────┘
```

### Why Three Languages?

| Language | Role | Why |
|----------|------|-----|
| **Python** | Signal bot, exchange simulator | ML ecosystem (PyTorch, scikit-learn). 50ms latency acceptable for signal generation. |
| **C++20** | HFT execution engine | Sub-millisecond loop. Zero-allocation hot path, lock-free queues, cache-line alignment. |

### Latency Budget

```
Exchange → [WS 2ms] → Signal Bot → [SHM 30us] → C++ Bot → [WS] → Exchange
C++ main loop: 1ms (configurable)
```

---

## Quick Start

### Windows
```bat
git clone https://github.com/ezpectus/HFT-TradeBot--Lite-version.git
cd HFT-TradeBot--Lite-version
install-deps.bat
no-docker.bat
```

### Linux/macOS
```bash
git clone https://github.com/ezpectus/HFT-TradeBot--Lite-version.git
cd HFT-TradeBot--Lite-version
./no-docker.sh install
./no-docker.sh start
```

### Docker
```bash
docker-compose up
```

### Mock mode (no backend)
```bash
cd web-ui && npm install
VITE_MOCK_MODE=true npm run dev
```

Open **http://localhost:3000**.

---

## Components

### Exchange Simulator (Python)
- GBM price generation with per-symbol volatility
- Microstructure models: Student-t, Merton jumps, Heston SV, Markov regime switching
- 49 crypto symbols, 3 exchanges (Binance, Bybit, OKX) with different fees
- Order book with depth, partial fills, slippage, market impact
- Options pricing (Black-Scholes, Binomial Tree, Greeks)
- Advanced orders: Stop-Limit, Trailing Stop, OCO, Iceberg
- Funding rates, liquidation engine, multi-exchange arbitrage detection

### AI Signal Bot (Python)
- Signal loop: data collection → technical analysis → strategies → validation → publish
- 7 wired strategies: Trend, MeanReversion, FFT, StatArb, MarketMaking, Sentiment, MLEnsemble
- Backtesting engine with walk-forward validation
- Risk management: VaR, CVaR, Kelly criterion, stress tests
- Portfolio optimization: Markowitz, Black-Litterman, risk parity
- Research library (`research/`, `src/ml/`): experimental quant/ML modules —
  present in the repo but not wired into the live signal loop (see audit S092/S095)

### HFT Trade Bot (C++20)
- Signal Engine V2: 6-indicator weighted composite (EMA, RSI, ADX, VWAP, OBI, Pressure)
- Signal Engine V3: HMM regime detection with online Baum-Welch, Viterbi decoding
- Lock-free SPSC queue, cache-line alignment (`alignas(64)`)
- SHM IPC for zero-copy Python ↔ C++ communication
- Direct WebSocket order execution to the configured exchange

### Web UI (React 18)
- ~290 panels with React.lazy code splitting
- Dark/light/auto theme, PWA, WCAG AA accessibility
- Backtest comparison, session replay, strategy competition
- Real-time WebSocket data, mock mode for standalone demo
- 116 test files (Vitest), 4 E2E specs (Playwright)

---

## Technology Stack

| Component | Language | Key Libraries |
|-----------|----------|---------------|
| Exchange Simulator | Python 3.12 | asyncio, websockets, numpy, orjson, msgpack |
| AI Signal Bot | Python 3.12 | asyncio, numpy, torch, scipy, optuna |
| HFT Trade Bot | C++20 | Boost, websocketpp, spdlog, fmt, nlohmann/json |
| Web UI | JS (ES2021) | React 18, Vite, TailwindCSS, lightweight-charts |
| Communication | — | WebSocket, SHM IPC |
| Database | — | SQLite (WAL), PostgreSQL (optional), Redis (optional) |
| CI/CD | — | GitHub Actions (Python, C++, JS, Docker) |
| Testing | — | pytest, CTest, Vitest, cargo test |

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System design, component overview, data flow |
| [Quick Start](docs/guides/QUICK_START.md) | Get running in 5 minutes |
| [Trading Guide](docs/guides/TRADING_GUIDE.md) | Orders, positions, strategies, risk |
| [Development Guide](docs/guides/DEVELOPMENT_GUIDE.md) | Setup, architecture, testing, standards |
| [Configuration](docs/guides/CONFIGURATION_GUIDE.md) | All configuration options |
| [Trading Strategies](docs/TRADING_STRATEGIES.md) | All strategies, HFT engine, routing |
| [REST API](docs/REST_API.md) | REST API reference |
| [WebSocket Protocol](docs/WEBSOCKET_PROTOCOL.md) | Message types, schema, reconnection |
| [Web UI](docs/WEB_UI.md) | Panels, performance, accessibility |
| [Advanced Orders](docs/ADVANCED_ORDER_TYPES.md) | Iceberg, TWAP, trailing stops, OCO |
| [Risk Management](docs/RISK_MANAGEMENT.md) | VaR, CVaR, Kelly, stress testing |
| [Monitoring](docs/MONITORING_GUIDE.md) | Prometheus, Grafana, Alertmanager |
| [Testing](docs/TESTING.md) | Test infrastructure and coverage |
| [Deployment](docs/DEPLOYMENT.md) | Deployment procedures |
| [Performance](docs/PERFORMANCE.md) | Latency targets and benchmarks |
| [Audit Findings](docs/AUDIT_FINDINGS.md) | Full grep-based code audit |
| [Project Audit](PROJECT_AUDIT.md) | Comprehensive project audit |
| [Contributing](CONTRIBUTING.md) | Setup, testing, code style, CI/CD |
| [Security](SECURITY.md) | Security policy and measures |

---

## Project Structure

```
hft-trading-system/
├── exchange_simulator/          # Python: simulated crypto exchange
├── ai-signal-bot/               # Python: AI signal generation (60+ modules)
│   ├── src/
│   │   ├── strategies/          # 7 wired trading strategies
│   │   ├── technical_analysis/  # Indicators, FFT, Hawkes, Kalman, etc.
│   │   ├── backtesting/         # Backtester, optimizer, walk-forward
│   │   ├── risk/                # VaR, CVaR, Kelly, stress tests
│   │   ├── portfolio/           # Markowitz, BL, risk parity
│   │   ├── ml/                  # Experimental ML modules (not wired — S092)
│   │   ├── research/            # Experimental quant library (not wired — S095)
│   │   └── communication/       # WebSocket, SHM
│   └── tests/
├── hft-trade-bot/               # C++20: HFT execution engine
├── web-ui/                      # React 18: dashboard (~290 components, 116 test files)
├── docs/                        # 13 documentation files + 4 guides + 7 theory docs
├── monitoring/                  # Prometheus + Grafana config
├── docker-compose.yml           # Development
├── docker-compose.prod.yml      # Production (+ PostgreSQL, Redis, Prometheus, Grafana)
└── shared_config.yaml           # 49 symbol definitions
```

---

## Configuration

| Component | Config file |
|-----------|------------|
| Exchange Simulator | `exchange_simulator/config.yaml` |
| AI Signal Bot | `ai-signal-bot/config/settings.yaml` |
| HFT Trade Bot | `hft-trade-bot/config/config.yaml` |
| Shared | `shared_config.yaml` |

Key defaults: 49 symbols, 5m timeframe, 60s signal interval, 2% risk per trade, 8% daily drawdown limit, 65% min confidence, paper trading mode.

---

## Production Deployment

```bash
cp .env.prod.example .env.prod
# Edit .env.prod with your settings
docker-compose -f docker-compose.prod.yml up -d
```

| Service | Port | Description |
|---------|------|-------------|
| Web UI | 3000 | React dashboard + `/health` endpoint |
| Grafana | 3001 | Monitoring dashboards |
| Exchange Simulator | 8765 | Market data (WebSocket) |
| Exchange Simulator | 8775 | Health (`/health`, `/live`, `/ready`) + `/metrics` |
| AI Signal Bot | 8766 | Signal publisher (WebSocket) |
| AI Signal Bot | 9092 | Prometheus metrics + `/health` (container-internal 9090) |
| HFT Trade Bot | 9091 | Health + metrics |
| AI Signal Bot | 8080 | Health server — internal only, not published in prod |
| Prometheus | 9090 | Internal only (`expose`); dev compose maps it to 9099 |
| PostgreSQL | 5432 | Trade persistence (optional, internal) |
| Redis | 6379 | Caching (optional, internal) |

---

## Reliability & Health Checks

All services expose HTTP health endpoints for Docker/Kubernetes probes:

| Service | Endpoint | Check |
|---------|----------|-------|
| Exchange Simulator | `GET :8775/health` | Status, clients, trading_active |
| Exchange Simulator | `GET :8775/live` | Liveness (always 200 if running) |
| Exchange Simulator | `GET :8775/ready` | Readiness (200 if trading active) |
| AI Signal Bot | `GET :8080/health` | Liveness + readiness checks |
| AI Signal Bot | `GET :9090/health` | Simple health OK |
| HFT Trade Bot | `GET :9091/health` | C++ health server |
| Web UI | `GET :3000/health` | Static nginx health |

**Graceful shutdown:** Both AI Signal Bot and Exchange Simulator handle SIGTERM/SIGINT — clean shutdown of WebSocket connections, background tasks, metrics servers, and tracing.

**WebSocket reconnection:** Exponential backoff (1s → 60s max) with jitter (±25%), automatic reconnect on `ConnectionClosed`/`OSError`.

**Docker Compose:** All 3 compose files use HTTP healthchecks. **Helm:** `httpGet` liveness/readiness probes (not `tcpSocket`).

See [Monitoring Guide](docs/MONITORING_GUIDE.md) for full details.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| WebSocket connection refused | Start exchange simulator first: `python -m exchange_simulator --no-visualizer` |
| Web UI shows no data | Check WS status indicators, try `VITE_MOCK_MODE=true npm run dev` |
| C++ build fails | Install Boost, websocketpp, spdlog, fmt, nlohmann-json, yaml-cpp. Need C++20 compiler. |
| SHM permission denied | Ensure `/dev/shm` writable. Docker: `--shm-size=256m` |

---

## Disclaimer

**Paper trading simulator for educational purposes.** No real exchange API, no real money, no financial advice. All market data is synthetically generated.

## License

Apache License 2.0. See [LICENSE](LICENSE).
