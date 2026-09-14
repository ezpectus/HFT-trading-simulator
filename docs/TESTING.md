# Testing

Guide to the testing infrastructure across all components of the HFT Trading System.

---

## Theory: Test pyramid and trading-specific testing

### Test pyramid (Cohn, 2009)

```
        E2E (few)           — Playwright browser tests
       /          \
    Integration (some)      — WebSocket flow, backtest pipeline
   /                \
  Unit (many)              — indicators, strategies, risk, PnL
 /                      \
Static (all)               — ruff, eslint, clang-format, rustfmt
```

**Why a pyramid, not an inverted (ice cream cone)?**
- **Unit tests:** Fast (ms), isolated, deterministic. Find bugs in
  individual functions. ~124 Python + 25 C++ + ~158 JS ≈ 307 unit test files.
- **Integration tests:** Slower (seconds), test component interaction.
  WebSocket connection, signal flow, backtest pipeline.
- **E2E tests:** Slowest (minutes), test full user journey.
  Playwright browser tests for Web UI.

**Cost is inversely proportional to speed:** Unit tests are cheap to run,
relatively expensive to write. E2E tests are expensive to run (slow),
cheap to write. Pyramid = optimal cost/speed ratio.

### Trading-specific testing challenges

**1. Numerical precision:** Floating point ≠ exact.
```python
# Wrong:
assert result == 0.1 + 0.2  # 0.30000000000000004
# Right:
assert abs(result - 0.3) < 1e-10
```

**2. Time-dependent logic:** Indicators depend on sequence order.
Tests must use deterministic data, not random. Seeded RNG.

**3. Stateful components:** Positions, equity, drawdown — stateful.
Each test must reset state. `setUp()` / `tearDown()`.

**4. Statistical tests:** Backtest results are stochastic.
Bootstrap significance testing (BacktestComparison) for comparing
strategies. Not a simple assert.

**5. Property-based testing (Hypothesis):** Instead of writing
specific test cases, generate random inputs satisfying properties.
`@given(st.lists(st.floats()))` → test with 100+ random inputs.
Finds edge cases a human wouldn't think of.

### Walk-forward testing — theory

**Walk-forward:** A method for detecting overfitting in strategy
optimization. Split data into N windows:

```
Window 1: [Train IS] [Test OOS]
Window 2:     [Train IS] [Test OOS]
Window 3:         [Train IS] [Test OOS]
```

On each window: train on IS, test on OOS. If IS >> OOS →
overfitting. Ratio IS/OOS > 2.0 = red flag. < 1.5 = acceptable.

### Coverage theory

**Line coverage:** % of lines executed. Necessary but insufficient.
**Branch coverage:** % of branches taken. Better than line coverage.
**Path coverage:** % of paths through code. Comprehensive but expensive.

**For trading:** Focus on risk module coverage (100% branch),
strategy edge cases (NaN, empty arrays, single element), and
numerical precision (tolerance-based assertions).

## Overview

The system has **~307 unit test files** across three languages:

| Language | Files | Framework | Location |
|----------|-------|-----------|----------|
| **Python** | 126 | pytest + Hypothesis | `ai-signal-bot/tests/`, `exchange_simulator/tests/`, `monitoring/tests/` |
| **C++** | 25 | doctest | `hft-trade-bot/tests/` |
| **JavaScript** | ~158 | Vitest + Playwright | `web-ui/src/test/` (~158), `web-ui/e2e/` (4 specs + 1 helper) |
| **Total** | **304** (+ 5 e2e files) | | |

---

## Python Tests (118 files)

### AI Signal Bot (88 files)

**Unit tests** (`ai-signal-bot/tests/unit/`): 85 files covering:

| Module | Test Files | Coverage |
|--------|-----------|----------|
| Strategies | test_strategies, test_ensemble_voter, test_market_making, test_sentiment, test_cross_exchange_arb, test_marketplace | All 10+ strategies |
| Risk | test_risk, test_risk_manager, test_cvar, test_kelly, test_position_sizing, test_portfolio_optimizer | VaR, CVaR, Kelly, stress tests |
| Portfolio | test_markowitz, test_portfolio_modules | Markowitz, BL, risk parity, rebalancing |
| Backtesting | test_backtest, test_backtester, test_backtest_engine, test_backtest_comparison, test_backtest_optimizer, test_backtest_plotter, test_pnl_calculator | Full backtesting pipeline |
| ML | test_ml_features, test_ml_ensemble_funding | Feature engineering, ML ensemble funding |
| Communication | test_circuit_breaker, test_comm_circuit_breaker, test_signal_publisher, test_shm_fill_consumer | WebSocket, SHM, circuit breaker |
| Monitoring | test_alerting, test_health_checks, test_health_server, test_metrics_server, test_monitoring_metrics, test_monitoring_llm, test_observability | Health, metrics, tracing, alerting |
| Data | test_exchange_factory, test_real_account, test_real_market_data | Data collection |
| Other | test_db, test_fft_analysis, test_indicators, test_bot_helpers | Database, indicators |

**Integration tests** (`ai-signal-bot/tests/integration/`): 4 files
- `test_e2e_pipeline.py` — End-to-end signal generation → order execution
- `test_trading_flow.py` — Full trading cycle simulation
- `test_strategy_risk_backtest.py` — Strategy → risk → backtest chain
- `test_integration.py` — HTTP endpoints and service wiring

All Python unit tests live under `tests/unit/` — the legacy flat `tests/` tree
was consolidated in R176 (S268): six same-name pairs were merged (unique
coverage ported into the unit files first) and the remaining 24 files moved.

### Exchange Simulator (29 files + 1 standalone load script)

**Unit tests** (`exchange_simulator/tests/`):

| Category | Test Files |
|----------|-----------|
| Core engine | test_exchange, test_simulator, test_simulated_exchange, test_market_simulator |
| Order types | test_advanced_order_types |
| Options | test_options_simulator |
| Funding & Liquidation | test_funding_liquidation, test_liquidation_depth |
| WebSocket | test_websocket_orderbook, test_websocket_server, test_ws_message_handler |
| Property-based | test_property_based (Hypothesis) |
| Security | test_security (log injection, order validation, overflow) |
| Load testing | tools/load_10k, tools/load_50_symbols, tools/stress_load (live-server harnesses, not pytest) |
| Chaos | tools/chaos_enhanced, tools/chaos_reconnect (live-server harnesses, not pytest) |
| Other | test_arbitrage, test_audit_logger, test_config_validator, test_correlation_funding, test_data_export, test_integration_dataflow, test_models, test_visualizer, test_visualizer_charts |

### Monitoring (1 file)

- `monitoring/tests/test_alerts.py` — Alert rule syntax validation

### Property-Based Testing

**Source:** `exchange_simulator/tests/test_property_based.py`

Uses Hypothesis for invariant testing:
- Random market data generation
- Price positivity invariant
- Volume non-negativity invariant
- Order book consistency invariants

### Security Testing

**Source:** `exchange_simulator/tests/test_security.py`

15 security tests covering:
- Log injection prevention
- Order validation (negative quantities, overflow)
- WebSocket message validation
- Numeric overflow protection
- Subscription channel security

---

## C++ Tests (25 files)

**Framework:** doctest (header-only, fast compilation)

**Location:** `hft-trade-bot/tests/`

| Category | Files | Coverage |
|----------|-------|----------|
| Signal engine | test_signal_engine, test_signal_engine_v2, test_doctest_signal_engine, test_doctest_signal_engine_v3 | V2/V3 indicators, HMM regime |
| Order management | test_order_manager, test_order_book, test_doctest_order_manager, test_doctest_order_book_manager | Order lifecycle, book updates |
| Position management | test_position_manager, test_doctest_position_manager, _v1, _v2 | Position tracking, P&L |
| Risk | test_risk, test_doctest_risk_manager, test_doctest_pre_trade_risk, test_doctest_portfolio_risk | Pre-trade checks, portfolio risk |
| Strategies | test_market_making, test_mean_reversion, test_doctest_market_making, _mean_reversion, _momentum_breakout, _statistical_arb | All C++ strategies |
| SHM IPC | test_shm, test_doctest_shm_bulk, _heartbeat, _market_data, test_integration_shm | Shared memory, heartbeat, bulk |
| Smart routing | test_doctest_smart_order_router, test_doctest_order_type_selector, test_doctest_adaptive_order_selector | Order routing logic |
| FIX protocol | test_fix, test_doctest_fix_message | FIX 4.4 message parsing |
| Integration | test_integration_config, test_integration_kill_switch_monitor, test_integration_signal_engine, test_signal_flow | Cross-component |
| Other | test_doctest_candle_aggregator, _cpp_optimizations, _kill_switch, _latency_tracker, _pressure_model, _property_based, _system_monitor, _trade_handler | Candles, kill switch, latency, pressure |

### Property-Based (C++)

**Source:** `hft-trade-bot/tests/test_doctest_property_based.cpp`

Randomized invariant testing for C++ components.

---

## JavaScript Tests (162 files)

### Unit Tests (~158 files)

**Framework:** Vitest
**Location:** `web-ui/src/test/`

| Category | Files | Coverage |
|----------|-------|----------|
| Components | 70+ component tests | Rendering, props, user interaction, error boundaries |
| Hooks | 16 hook tests | useLocalStorage, useWebSocket, useExchangeData, useDebounce, useInterval, useKeyboardShortcuts, useMediaQuery, useMockData, usePerformance, useSoundAlerts, useTradeJournal, useAnimatedNumber, useDetachablePanels, useTheme |
| Math/Indicators | 8+ math tests | Kalman, HMM, GARCH, KMeans, cointegration, backtestEngine, indicators, performance |
| Utils | 5+ utility tests | utils, registry, virtualList, format, patterns |

### E2E Tests (4 specs + 1 helper)

**Framework:** Playwright
**Location:** `web-ui/e2e/`

| File | Description |
|------|-------------|
| `mock-mode.spec.js` | Mock data mode functionality |
| `screenshots.spec.js` | Visual regression screenshots |
| `smoke.spec.js` | Basic smoke tests |
| `trading.spec.js` | Trading workflow E2E |
| `dismiss-onboarding.js` | Shared onboarding-dismissal helper |

---

## Monitoring Tests

**Framework:** pytest
**Location:** `monitoring/tests/`

| File | Coverage |
|------|----------|
| `test_alerts.py` | Alert rule validation — metric names match exports, severity routing |

---

## Health Endpoint Tests

Health endpoints are verified in integration tests:

| Service | Endpoint | Test |
|---------|----------|------|
| Exchange Simulator | `GET :8775/health` | `exchange_simulator/tests/test_websocket_server.py` |
| AI Signal Bot | `GET :8080/health` | `ai-signal-bot/tests/integration/test_integration.py` |
| AI Signal Bot | `GET :9090/metrics` | `ai-signal-bot/tests/integration/test_integration.py` |

---

## Running Tests

### Python

```bash
# All Python tests
cd ai-signal-bot && python -m pytest tests/ -v
cd exchange_simulator && python -m pytest tests/ -v

# Monitoring tests
cd monitoring && python -m pytest tests/ -v

# With coverage
python -m pytest tests/ --cov=src --cov-report=html

# Property-based only
python -m pytest tests/test_property_based.py -v

# Security tests only
python -m pytest tests/test_security.py -v
```

### C++

```bash
cd hft-trade-bot && mkdir -p build && cd build
cmake .. && cmake --build .
ctest --output-on-failure   # each test_* executable is registered with add_test
```

### JavaScript

```bash
cd web-ui
npm run test:run      # All unit tests (single run)
npm test              # Same, watch mode
npm run test:e2e      # Playwright E2E
npm run test:coverage # With coverage report
```

### Pre-commit Gate

`scripts/pre-commit-check.py` runs the same checks locally that CI enforces
(lint, unit tests, coverage gate, config consistency):

```bash
python scripts/pre-commit-check.py --quick   # staged files only
python scripts/pre-commit-check.py --all     # full suite
```

---

## Test Principles

1. **AAA pattern** — Arrange, Act, Assert
2. **Deterministic** — no sleep, no random without seed, no network calls
3. **Isolated** — tests don't depend on each other or execution order
4. **Edge cases** — None/null, empty arrays, NaN, inf, large values, boundaries
5. **Mock external deps** — WebSocket, exchange API, database
6. **Regression tests** — every bug fix gets a regression test

---

## CI/CD Integration

**Source:** `.github/workflows/ci.yml`

| Job | Matrix | Steps |
|-----|--------|-------|
| Python tests | Python 3.12 | Install deps → pytest → coverage |
| C++ tests | Ubuntu (gcc-14, clang-17), Windows (MSVC) | cmake → build → ctest |
| JS tests | Node 22 | npm ci → vitest → playwright |
| Linting | Python (ruff), JS (eslint `*.{js,jsx}` + `tsc --noEmit` for `.ts`, S269 fixed R156) | ruff check, eslint, typecheck |

---

## See Also

- [Architecture](ARCHITECTURE.md) — System component overview
- [Deployment](DEPLOYMENT.md) — CI/CD pipeline details
- [Development Guide](guides/DEVELOPMENT_GUIDE.md) — Setting up dev environment
