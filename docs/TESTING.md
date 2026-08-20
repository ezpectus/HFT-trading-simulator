# Testing

Guide to the testing infrastructure across all components of the HFT Trading System.

---

## Overview

The system has **208 test files** across three languages:

| Language | Files | Framework | Location |
|----------|-------|-----------|----------|
| **Python** | 118 | pytest + Hypothesis | `ai-signal-bot/tests/`, `exchange_simulator/tests/` |
| **C++** | 46 | doctest | `hft-trade-bot/tests/` |
| **JavaScript** | 44 | Vitest + Playwright | `web-ui/src/test/`, `web-ui/e2e/` |
| **Total** | **208** | | |

---

## Python Tests (118 files)

### AI Signal Bot (49 files)

**Unit tests** (`ai-signal-bot/tests/unit/`): 47 files covering:

| Module | Test Files | Coverage |
|--------|-----------|----------|
| Strategies | test_strategies, test_ensemble_voter, test_market_making, test_sentiment, test_cross_exchange_arb, test_marketplace | All 10+ strategies |
| Risk | test_risk, test_risk_manager, test_cvar, test_kelly, test_position_sizing, test_portfolio_optimizer | VaR, CVaR, Kelly, stress tests |
| Portfolio | test_markowitz, test_portfolio_modules | Markowitz, BL, risk parity, rebalancing |
| Backtesting | test_backtest, test_backtester, test_backtest_engine, test_backtest_comparison, test_backtest_optimizer, test_backtest_plotter, test_order_book_replay, test_pnl_calculator | Full backtesting pipeline |
| ML | test_ml_modules, test_ml_models, test_ml_features, test_ml_ensemble_funding | LSTM, Transformer, DQN, feature store, model registry |
| Communication | test_circuit_breaker, test_comm_circuit_breaker, test_fix_client, test_signal_publisher, test_shm_fill_consumer | WebSocket, FIX, SHM, circuit breaker |
| Monitoring | test_alerting, test_health_check, test_health_server, test_metrics_server, test_monitoring_metrics, test_monitoring_llm, test_observability | Health, metrics, tracing, alerting |
| Data | test_exchange_factory, test_real_account, test_real_exchange_client, test_real_market_data | Data collection |
| Research | test_research_modules | Greeks hedging, attribution, genetic strategy |
| Other | test_db, test_dpdk_transport, test_fft_analysis, test_indicators, test_notifier, test_bot_helpers | Database, networking, indicators |

**Integration tests** (`ai-signal-bot/tests/integration/`): 2 files
- `test_e2e_pipeline.py` — End-to-end signal generation → order execution
- `test_trading_flow.py` — Full trading cycle simulation

**Root-level tests** (`ai-signal-bot/tests/`): 18 files
- test_backtest, test_config_validator, test_fft, test_indicators, test_integration, test_kelly, test_ml, test_optimizer, test_order_book_replay, test_portfolio, test_portfolio_optimizer, test_risk, test_risk_manager, test_signal_publisher, test_strategies, test_validator

### Exchange Simulator (36 files)

**Unit tests** (`exchange_simulator/tests/`):

| Category | Test Files |
|----------|-----------|
| Core engine | test_exchange, test_simulator, test_simulated_exchange, test_market_simulator |
| Order types | test_advanced_order_types, test_order_book_realism |
| Options | test_options_pricing, test_options_simulator |
| Microstructure | test_market_microstructure, test_spread_analytics |
| Funding & Liquidation | test_funding_rate, test_funding_liquidation, test_liquidation_engine_v2, test_liquidation_depth |
| Price feed | test_price_feed_apis, test_price_feed_manager, test_price_feed_models, test_price_feed_performance |
| WebSocket | test_websocket_orderbook, test_websocket_server |
| Property-based | test_property_based (Hypothesis) |
| Security | test_security (log injection, order validation, overflow) |
| Load testing | test_load_10k, load_test_50_symbols |
| Chaos | test_chaos_enhanced, test_chaos_reconnect |
| Other | test_arbitrage, test_audit_logger, test_config_validator, test_correlation_funding, test_data_export, test_exchange_metrics, test_health, test_integration_dataflow, test_latency_simulation, test_models, test_visualizer |

### Monitoring (2 files)

- `monitoring/tests/test_metrics.py` — Prometheus metrics validation
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

## C++ Tests (46 files)

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

## JavaScript Tests (44 files)

### Unit Tests (40 files)

**Framework:** Vitest
**Location:** `web-ui/src/test/`

| Category | Files | Coverage |
|----------|-------|----------|
| Components | accountPanel, botStatus, confidenceScorer, drawdownAnalysis, exchange-ui, fillsPanel, loadingSkeleton, orderForm, panelErrorBoundary, priceAlerts, replayControls, signalFeed, toast, tradeTimeline, watchlist | 15 component tests |
| Hooks | useAnimatedNumber, useDebounce, useDetachablePanels, useExchangeData, useInterval, useKeyboardShortcuts, useLocalStorage, useMediaQuery, useMockData, usePerformance, useSoundAlerts, useTheme, useTradeJournal, useWebSocket | 14 hook tests |
| Math/Indicators | backtestEngine, cointegration, garch, hmm, kalman, kmeans, indicators, performance | 8 math tests |
| Utils | utils, registry, virtualList | 3 utility tests |

### E2E Tests (4 files)

**Framework:** Playwright
**Location:** `web-ui/e2e/`

| File | Description |
|------|-------------|
| `mock-mode.spec.js` | Mock data mode functionality |
| `screenshots.spec.js` | Visual regression screenshots |
| `smoke.spec.js` | Basic smoke tests |
| `trading.spec.js` | Trading workflow E2E |

---

## Rust Tests (21 tests)

**Framework:** `#[test]` (built-in)
**Location:** `hft-executor/src/lib.rs`

Coverage: Order creation, submit (single/batch), stats, FFI create/submit/destroy, null safety, serialization round-trip, all 5 order types.

---

## Running Tests

### Python

```bash
# All Python tests
cd ai-signal-bot && python -m pytest tests/ -v
cd exchange_simulator && python -m pytest tests/ -v

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
cmake .. -DBUILD_TESTS=ON && cmake --build .
./tests/test_runner
```

### JavaScript

```bash
cd web-ui
npm test              # All unit tests
npm run test:e2e      # Playwright E2E
npm run test:coverage # With coverage report
```

### Rust

```bash
cd hft-executor && cargo test
```

### All Tests (CI)

```bash
# Windows
run-all-tests.bat

# Linux/macOS
./run-all-tests.sh
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
| Python tests | Python 3.11, 3.12 | Install deps → pytest → coverage |
| C++ tests | Ubuntu, Windows | cmake → build → test_runner |
| JS tests | Node 20, 22 | npm ci → vitest → playwright |
| Rust tests | Ubuntu, Windows | cargo test |
| Linting | Python (ruff), JS (eslint) | ruff check, eslint |

---

## See Also

- [Architecture](ARCHITECTURE.md) — System component overview
- [Deployment](DEPLOYMENT.md) — CI/CD pipeline details
- [Development Guide](guides/DEVELOPMENT_GUIDE.md) — Setting up dev environment
