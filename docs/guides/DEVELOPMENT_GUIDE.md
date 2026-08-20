# Development Guide

**Last Updated:** August 20, 2026

Guide for developers extending and contributing to the HFT Trading System.

## Project Structure

```
trading-system-lite/
├── exchange_simulator/     # Python — market simulation engine
├── ai-signal-bot/          # Python — AI trading signals
├── hft-trade-bot/          # C++20 — low-latency execution engine
├── hft-executor/           # Rust — alternative executor (experimental)
├── web-ui/                 # React — trading dashboard
├── monitoring/             # Prometheus, Grafana, alerts
├── helm/                   # Kubernetes Helm chart
├── terraform/              # Infrastructure as Code
├── docs/                   # Documentation
└── scripts/                # Utility scripts
```

## Tech Stack

| Component | Language | Framework | Test Framework |
|-----------|----------|-----------|----------------|
| Exchange Simulator | Python 3.12 | asyncio, websockets | pytest, hypothesis |
| AI Signal Bot | Python 3.12 | asyncio, numpy, scipy | pytest |
| HFT Trade Bot | C++20 | Boost, websocketpp | doctest |
| HFT Executor | Rust | tokio | cargo test |
| Web UI | JavaScript | React, Vite, TailwindCSS | Vitest, Playwright |

## Code Quality Standards

- **Python:** Ruff (line-length=120), all functions <40 lines, all files <500 lines
- **C++:** clang-format, all functions <40 lines, no bare except, no TODO/FIXME
- **JavaScript:** ESLint, Prettier, React.memo for high-frequency components
- **Tests:** 100% module coverage, property-based tests for critical paths

## Adding a New Trading Strategy

1. Create strategy file in `ai-signal-bot/src/strategies/`:

```python
class MyStrategy:
    def __init__(self, config: dict):
        self.param = config.get("param", 10)

    def analyze(self, symbol: str, candles: list) -> Signal:
        if len(candles) < self.param:
            return Signal(direction=SignalDirection.NEUTRAL, confidence=0)
        # ... analysis logic ...
        return Signal(
            direction=SignalDirection.LONG,
            confidence=85.0,
            stop_loss=...,
            take_profit=...,
            strategy_name="my_strategy",
            reason="Bullish divergence detected"
        )
```

2. Register in `strategies.py` and add to config
3. Write unit tests in `tests/unit/`
4. Update `docs/MATH_MODELS.md` if using new math

## Adding a New WebSocket Message Type

1. Add handler in `exchange_simulator/ws_message_handler.py`
2. Update `docs/WEBSOCKET_PROTOCOL.md`
3. Add client-side handling in `ai-signal-bot/src/communication/ws_client.py`
4. Write tests in `exchange_simulator/tests/test_websocket_server.py`

## Adding a New Web UI Panel

1. Create component in `web-ui/src/components/`
2. Register in `web-ui/src/panels/PanelRegistry.jsx`
3. Use `React.lazy` for code splitting (see `App.jsx` pattern)
4. Add tests in `web-ui/src/test/`

## Running Tests

### Python Tests

```bash
# Exchange Simulator
cd exchange_simulator
pytest tests/ -v --cov

# AI Signal Bot
cd ai-signal-bot
pytest tests/ -v --cov
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
# Bundle analysis
cd web-ui
npm run build -- --analyze
```

## Deployment

### Docker

```bash
docker-compose up -d              # Development
docker-compose -f docker-compose.prod.yml up -d  # Production
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

## CI/CD Pipeline

GitHub Actions workflows in `.github/workflows/`:
- `ci.yml` — Lint, test, build on every push
- `deploy.yml` — Deploy on merge to main
- `codeql.yml` — Security analysis

## Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Write code following quality standards
3. Add tests for new functionality
4. Run all tests: `./run-all-tests.sh`
5. Update documentation
6. Submit a pull request using the PR template

## See Also

- [Quick Start Guide](./QUICK_START.md)
- [Configuration Guide](./CONFIGURATION_GUIDE.md)
- [Trading Guide](./TRADING_GUIDE.md)
- [Architecture](../ARCHITECTURE.md)
- [WebSocket Protocol](../WEBSOCKET_PROTOCOL.md)
