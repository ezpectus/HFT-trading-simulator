# Development Guide

Guide for developers extending and contributing to the HFT Trading System.

## Theory: Polyglot development — how to work in a multi-language project

### Why 4 languages and how they interact

**Python (AI Signal Bot, Exchange Simulator):** Rapid prototyping,
rich ecosystem (numpy, scipy, PyTorch). Slow execution (~50ms).
For complex analysis, not time-critical.

**C++20 (HFT Trade Bot):** Deterministic latency, no GC, compiled.
Fast execution (~15us). For time-critical signal generation, order
execution.

**Rust (Executor):** Memory safety without GC. C ABI compatibility.
For FFI bridge between C++ and external systems.

**JavaScript/React (Web UI):** Browser-based UI. Declarative,
component-based. For visualization, user interaction.

**Communication:** WebSocket (cross-language, JSON/MessagePack).
SHM (zero-copy, C++ ↔ Python). FFI (C ABI, C++ ↔ Rust).

### Adding a new strategy — theory

1. Implement `analyze(symbol, candles) -> Signal` interface
2. Register in strategy registry
3. Add to ensemble voter config
4. Write unit tests (edge cases: empty, NaN, single element)
5. Backtest with walk-forward validation
6. Check correlation with existing strategies (diversity for ensemble)

**Condorcet theorem reminder:** New strategy must be:
- Independent from existing strategies (low correlation)
- Better than random (>50% accuracy)
- Diverse approach (not another EMA variant)

### Adding a new indicator — theory

**O(1) incremental update:** Indicator must update in constant time.
EMA: one multiply-add. RSI: running average. Not O(N) recalculation.

**Numerical stability:** Use log-space for products. Use Kahan
summation for running sums. Avoid catastrophic cancellation.

**Testing:** Property-based testing (Hypothesis). Test with random
inputs, edge cases (NaN, inf, zero, negative).

---

## Project Structure

```
trading-system-lite/
├── exchange_simulator/     # Python — market simulation engine
│   ├── exchange_simulator/ # Core package
│   │   ├── __init__.py
│   │   ├── __main__.py     # Entry point
│   │   ├── market_simulator.py
│   │   ├── market_microstructure.py
│   │   ├── exchange.py
│   │   ├── options.py
│   │   ├── liquidation.py
│   │   └── ...
│   ├── tests/              # 36 test files
│   ├── config/
│   └── requirements.txt
├── ai-signal-bot/          # Python — AI trading signals
│   ├── src/
│   │   ├── strategies/     # 10+ trading strategies
│   │   ├── risk/           # VaR, CVaR, Kelly, stress tests
│   │   ├── backtesting/    # Full backtest engine
│   │   ├── ml/             # ML models (PPO, LSTM, Transformer)
│   │   ├── research/       # 34 quant research modules
│   │   ├── portfolio/      # Markowitz, BL, Risk Parity
│   │   ├── technical_analysis/  # 18 TA modules
│   │   ├── communication/  # WebSocket, FIX, SHM IPC
│   │   ├── monitoring/     # Metrics, alerting, health
│   │   ├── observability/  # Tracing, logging
│   │   ├── llm_engine/     # LLM for signal explanations
│   │   ├── notification/   # Telegram, email, Discord
│   │   ├── database/       # SQLite, models, migrations
│   │   └── ...
│   ├── tests/              # 118 test files
│   ├── config/
│   └── requirements.txt
├── hft-trade-bot/          # C++20 — low-latency execution engine
│   ├── src/
│   │   ├── strategies/     # Signal Engine V2/V3
│   │   ├── core/           # Order management, risk
│   │   ├── data/           # Market data handlers
│   │   └── communication/  # WebSocket, SHM, FIX
│   ├── tests/              # 46 test files (doctest)
│   ├── config/
│   ├── CMakeLists.txt
│   └── pch.h
├── hft-executor/           # Rust — FFI executor (experimental)
│   ├── src/lib.rs
│   ├── Cargo.toml
│   └── Cargo.lock
├── web-ui/                 # React — trading dashboard
│   ├── src/
│   │   ├── components/     # 227 React components
│   │   ├── contexts/       # React contexts
│   │   ├── hooks/          # Custom hooks
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── e2e/                # Playwright E2E tests
│   └── package.json
├── monitoring/             # Prometheus, Grafana, alerts, eBPF
├── helm/                   # Kubernetes Helm chart
├── terraform/              # AWS infrastructure (EKS, RDS, ElastiCache)
├── docs/                   # Documentation (this folder)
├── scripts/                # Utility scripts
└── shared_config.yaml      # Global shared configuration
```

---

## Tech Stack

| Component | Language | Framework | Test Framework |
|-----------|----------|-----------|----------------|
| Exchange Simulator | Python 3.12 | asyncio, websockets, numpy | pytest, hypothesis |
| AI Signal Bot | Python 3.12 | asyncio, numpy, scipy, PyTorch | pytest |
| HFT Trade Bot | C++20 | Boost, websocketpp, spdlog | doctest |
| HFT Executor | Rust | tokio, crossbeam | cargo test |
| Web UI | JavaScript | React 18, Vite, TailwindCSS | Vitest, Playwright |

---

## Inter-Component Communication

| Channel | From → To | Protocol | Latency |
|---------|-----------|----------|---------|
| WebSocket | Exchange → AI Bot, HFT, UI | JSON over WS | ~1-5ms |
| WebSocket | AI Bot → HFT, UI | JSON over WS | ~1-5ms |
| Shared Memory (SHM) | AI Bot → HFT | SPSC ring buffer | ~10-50μs |
| FIX 4.4 | HFT → Exchange | FIX protocol over TCP | ~100μs |
| FFI (C ABI) | HFT (C++) → Executor (Rust) | Function call | ~1μs |
| HTTP /metrics | All → Prometheus | Prometheus exposition | 15s scrape |

### SHM IPC (Shared Memory)

The fastest communication channel — used for time-critical signal transfer
from Python AI Signal Bot to C++ HFT Trade Bot:

- **SPSC ring buffer** — Single Producer, Single Consumer, lock-free
- **Cache-line aligned** — 64-byte alignment to prevent false sharing
- **Memory-mapped** — `mmap` on Linux, equivalent on Windows
- **Binary layout** — Fixed-size structs, no serialization overhead

---

## Code Quality Standards

| Language | Linter | Rules |
|----------|--------|-------|
| Python | Ruff | line-length=120, all functions <40 lines, all files <500 lines |
| C++ | clang-format | all functions <40 lines, no bare except, no TODO/FIXME |
| JavaScript | ESLint + Prettier | React.memo for high-frequency components |
| Tests | — | 100% module coverage, property-based tests for critical paths |

---

## Reliability & Observability

### Health Endpoints

Every service exposes HTTP health endpoints for Docker/Kubernetes probes:

| Service | Port | Endpoints |
|---------|------|-----------|
| Exchange Simulator | 8775 | `/health`, `/live`, `/ready`, `/metrics` |
| AI Signal Bot (HealthServer) | 8080 | `/health` (liveness + readiness checks) |
| AI Signal Bot (MetricsExporter) | 9090 | `/health`, `/metrics` |
| HFT Trade Bot | 9091 | `/health` |
| Web UI | 3000 | `/health` (nginx) |

### Graceful Shutdown

Both Python services handle SIGTERM/SIGINT for clean shutdown:
- `run.py`: `signal.signal(SIGTERM, _signal_handler)` → stops main loop, cancels tasks, closes connections
- `exchange_simulator/__main__.py`: `loop.add_signal_handler(SIGTERM, ...)` → sets shutdown event

### WebSocket Reconnection

`ws_client.py` implements exponential backoff (1s → 60s max) with ±25% jitter. See [WebSocket Protocol](../WEBSOCKET_PROTOCOL.md#reconnection--backoff) for details.

### Structured Logging

Set `LOG_FORMAT=json` for production (used in docker-compose.prod.yml). Falls back to text format for development.

### Tracing

OpenTelemetry tracing initialized in `run.py` via `setup_tracing(service_name="ai-signal-bot")`. Export to Jaeger on `http://jaeger:4317`.

### Metrics

Prometheus scrapes `/metrics` every 15s. Three metric namespaces:
- `ai_signal_bot_*` — alert-specific (circuit breaker, signals, errors, drawdown)
- `trading_*` — operational (orders, fills, latency, positions)
- `exchange_*` — simulator (clients, candles, orders, prices)

See [Monitoring Guide](../MONITORING_GUIDE.md) for full details.

---

## Adding a New Trading Strategy

1. **Create strategy file** in `ai-signal-bot/src/strategies/`:

```python
from .signal import Signal, SignalDirection

class MyStrategy:
    def __init__(self, config: dict):
        self.param = config.get("param", 10)

    def analyze(self, symbol: str, candles: list) -> Signal:
        if len(candles) < self.param:
            return Signal(direction=SignalDirection.NEUTRAL, confidence=0)
        # ... analysis logic ...
        return Signal(
            symbol=symbol,
            direction=SignalDirection.LONG,
            confidence=85.0,
            entry_price=candles[-1]["close"],
            stop_loss=...,
            take_profit=...,
            strategy_name="my_strategy",
            reason="Bullish divergence detected"
        )
```

2. **Register** in `strategies.py` and add to config (`settings.yaml`)
3. **Write unit tests** in `tests/unit/test_my_strategy.py`
4. **Update documentation** if using new math

---

## Adding a New WebSocket Message Type

1. Add handler in `exchange_simulator/exchange_simulator/ws_message_handler.py`
2. Update `docs/WEBSOCKET_PROTOCOL.md`
3. Add client-side handling in `ai-signal-bot/src/communication/ws_client.py`
4. Write tests in `exchange_simulator/tests/test_websocket_server.py`

---

## Adding a New Web UI Panel

1. Create component in `web-ui/src/components/`
2. Register in `web-ui/src/panels/PanelRegistry.jsx`
3. Use `React.lazy` for code splitting (see `App.jsx` pattern)
4. Add tests in `web-ui/src/test/`

---

## Running Tests

### Python Tests

```bash
# Exchange Simulator
cd exchange_simulator
pytest tests/ -v --cov

# AI Signal Bot — all tests
cd ai-signal-bot
pytest tests/ -v --tb=short

# AI Signal Bot — unit only
pytest tests/unit/ -v

# Specific test
pytest tests/ -k "test_var" -v

# With coverage
pytest tests/ --cov=src --cov-report=html

# Parallel
pytest tests/ -v -n auto
```

### C++ Tests

```bash
cd hft-trade-bot
mkdir build && cd build
cmake .. && cmake --build .
ctest --output-on-failure
```

### Web UI Tests

```bash
cd web-ui
npm run test        # Unit tests (Vitest)
npm run test:e2e    # E2E tests (Playwright)
```

### All Tests at Once

```bash
# Linux/macOS
./run-all-tests.sh

# Windows
run-all-tests.bat
```

---

## Performance Profiling

### Python

```bash
# Profile exchange simulator
python -m cProfile -o profile.out -m exchange_simulator
python -c "import pstats; pstats.Stats('profile.out').sort_stats('cumulative').print_stats(50)"
```

### C++

```bash
# Build with profiling
cmake -DCMAKE_BUILD_TYPE=Debug ..
cmake --build .
./hft_trade_bot --profile
```

### Web UI

```bash
cd web-ui
npm run build -- --analyze
```

---

## Deployment

### Docker (Development)

```bash
docker-compose up -d
```

### Docker (Production)

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes (Helm)

```bash
helm install hft ./helm
```

### Terraform (AWS)

```bash
cd terraform/environments/dev
terraform init
terraform plan
terraform apply
```

See [Deployment Guide](../DEPLOYMENT.md) for full instructions.

---

## CI/CD Pipeline

GitHub Actions workflows in `.github/workflows/`:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push, PR | Lint (Ruff, clang-format, ESLint), test, build, upload coverage |
| `deploy.yml` | Tag, main merge | Deploy Web UI to Netlify, build and push Docker images |
| `codeql.yml` | Schedule, push | Static security analysis (C++, Python, JS) |

### Dependabot

Automated weekly dependency updates for:
- Python (pip) — all components
- npm — Web UI
- GitHub Actions
- Docker base images

---

## Contributing

1. **Fork** the repository
2. **Create branch**: `git checkout -b feature/my-feature`
3. **Write code** following quality standards (see above)
4. **Add tests** for new functionality
5. **Run all tests**: `./run-all-tests.sh`
6. **Update documentation** if needed
7. **Submit PR** using the template in `.github/PULL_REQUEST_TEMPLATE.md`

### PR Checklist

- [ ] Code passes linter (Ruff / clang-format / ESLint)
- [ ] All tests pass
- [ ] New functions < 40 lines
- [ ] New files < 500 lines
- [ ] No TODO/FIXME in production code
- [ ] Documentation updated if needed
- [ ] No hardcoded secrets or API keys

---

## See Also

- [Quick Start Guide](./QUICK_START.md)
- [Configuration Guide](./CONFIGURATION_GUIDE.md)
- [Trading Guide](./TRADING_GUIDE.md)
- [Architecture](../ARCHITECTURE.md)
- [WebSocket Protocol](../WEBSOCKET_PROTOCOL.md)
- [Testing](../TESTING.md)
- [Performance](../PERFORMANCE.md)
