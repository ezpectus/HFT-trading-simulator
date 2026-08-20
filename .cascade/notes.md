# Cascade Notes — HFT Trading System

## Project Context

- **Project:** HFT Trading System — educational crypto HFT simulator
- **Version:** 3.0.0
- **Stack:** Python 3.12 (simulator, signal bot), C++20 (trade bot), Rust (executor), React 18 (web UI)
- **Components:** Exchange Simulator, AI Signal Bot, HFT Trade Bot, hft-executor, Web UI
- **Honest readiness:** 66% (v6.1 audit — not 85% as README badges originally claimed)

## Key Files

- `exchange_simulator/market_simulator.py` — GBM price engine
- `ai-signal-bot/src/strategies/strategies.py` — base strategy + Signal
- `ai-signal-bot/src/strategies/ml_ensemble.py` — ML ensemble + HMM + IsolationForest
- `ai-signal-bot/src/technical_analysis/indicators.py` — EMA, RSI, MACD, Bollinger, ATR, VWAP, ADX
- `ai-signal-bot/src/technical_analysis/fft_analysis.py` — FFT analysis
- `ai-signal-bot/run.py` — main entry point
- `hft-trade-bot/src/strategies/signal_engine_v2.h` — C++ indicators
- `hft-trade-bot/src/strategies/signal_engine_v3.h` — HMM regime detection
- ~~`hft-trade-bot/src/ml/gpu_accelerator.cu`~~ — REMOVED (Sprint 43, dead code)
- ~~`hft-trade-bot/src/ml/onnx_engine.h`~~ — REMOVED (Sprint 43, dead code)
- `ai-signal-bot/src/pricing/volatility_surface.py` — SVI/SABR volatility surface (EXISTS, v4.0 wrongly said missing)
- `exchange_simulator/exchange.py` — order matching, slippage, market impact, partial fills
- `exchange_simulator/market_simulator.py` — GBM + correlated multi-symbol + news events
- `exchange_simulator/exchange_simulator/market_microstructure.py` — Student-t, Merton, Heston, Markov regime, U-shaped intraday vol
- `exchange_simulator/options_strategies.py` — Straddle, Strangle, Iron Condor, Butterfly
- `hft-executor/src/lib.rs` — Rust order executor (WS stub, tests added Sprint 44)
- `shared_config.yaml` — global config

## Known Critical Issues (audit v6.1)

1. README.md badges inflated — FIXED in v4.3 (75+ models → 44+40 UI-only, 34+ strategies → 19, panel count corrected 197→204 in Sprint 17)
2. 40+ models exist ONLY as UI (.jsx), NOT in trading pipeline
3. ~~CUDA/ONNX — dead code behind #ifdef, never compiled in CI~~ → ✅ REMOVED (Sprint 43)
4. ~~SVI/SABR — does NOT exist~~ → ✅ EXISTS in `volatility_surface.py` (v4.1 correction)
5. ~~Student-t/Merton/Heston/Markov regime — MISSING~~ → ✅ ALL EXIST in `market_microstructure.py` (v4.2 correction)
6. ML models not trained (code exists, no weights)
7. Quantum models — 0%
8. Broker integration — 5% (FIX framework exists, not connected)
9. Real HFT features — 10% (no co-location, DMA, PTP, GPS, tick data)
10. 10 models don't exist ANYWHERE (Hurst, VPIN, Kyle's Lambda, etc.)
11. Rust executor — WebSocket is a stub (logs JSON, no real WS), 0 tests

## Architecture Patterns

- **Communication:** WebSocket (simulator ↔ UI), SHM IPC (bot ↔ C++), FIX 4.4 (C++ framework), FFI (C++ ↔ Rust)
- **Strategies:** 10 Python (TrendFollowing, MeanReversion, FFTCycle, StatArb, MarketMaking, Sentiment, MLEnsemble, Portfolio, CrossExchangeArb, FundingArb) + 3 auxiliary (Marketplace, EnsembleVoter, CircuitBreaker)
- **C++ Strategies:** 6 (Signal V2, V3, Mean Rev, Momentum, Stat Arb, Market Making)
- **Total strategies:** 19 (not 34+ as README claimed)
- **ML:** LSTM, Transformer, RL (PPO/DQN), AutoML, Price Predictor — NOT trained
- **Risk:** VaR, CVaR, Kelly, stress test, position sizing
- **Portfolio:** Markowitz, Black-Litterman, risk parity
- **Market Microstructure:** Student-t (df=4), Merton jump diffusion, Heston stochastic vol, Markov regime switching (4-state), U-shaped intraday vol (`market_microstructure.py`)
- **Volatility:** SVI, SABR (volatility_surface.py)
- **Options:** Black-Scholes, Binomial Tree, Greeks, Implied Vol, Straddle, Strangle, Iron Condor, Butterfly (`options_pricing.py`, `options_strategies.py`, `options_simulator.py`)
- **Test files:** 208 (118 Python + 46 C++ + 44 JS)
- **UI:** 227 React components, 204 registered panels
- **Trading logic models:** 44 (not 75+ as README originally claimed)

## Useful Commands

```bash
# Run exchange simulator
python -m exchange_simulator

# Run AI signal bot
python ai-signal-bot/run.py

# Run web UI
cd web-ui && npm run dev

# Run tests (per component)
cd exchange_simulator && python -m pytest tests/
cd ai-signal-bot && python -m pytest tests/

# Build C++ trade bot
cd hft-trade-bot && mkdir build && cd build && cmake .. && make

# Build Rust executor
cd hft-executor && cargo build --release
```

## Audit Session — Bugs #121-132 (Exchange Simulator + Web UI)

**Files fixed:**
- `web-ui/src/utils/backtestEngine.js` — 7 division-by-zero guards (Bugs #121-127)
- `exchange_simulator/websocket_server.py` — deque for O(1) metrics (Bug #128)
- `exchange_simulator/exchange.py` — SL/TP zero guards (Bug #129)
- `exchange_simulator/exchange_simulator/liquidation_engine_v2.py` — PnL double-count fix (Bug #130)
- `exchange_simulator/price_feed_manager.py` — deque for O(1) metrics (Bug #131)
- `exchange_simulator/visualizer.py` — division-by-zero guards (Bug #132)

**Files scanned (no bugs found):**
- `exchange_simulator/options_pricing.py` (420 lines) — Black-Scholes + Binomial Tree, edge cases guarded
- `exchange_simulator/options_strategies.py` (310 lines) — straddle/strangle/iron condor/butterfly
- `exchange_simulator/health.py` (120 lines) — FastAPI health/metrics endpoints
- `exchange_simulator/metrics.py` (252 lines) — Prometheus metrics collector
- `exchange_simulator/audit_logger.py` (313 lines) — Thread-safe audit logging with deque
- `exchange_simulator/tracing.py` (193 lines) — OpenTelemetry tracing
- `exchange_simulator/exchange_simulator/config_validator.py` (241 lines) — Config validation
- `exchange_simulator/exchange_simulator/arbitrage.py` (295 lines) — Cross-exchange arb detector
- `exchange_simulator/visualizer.py` (729 lines) — Terminal dashboard (2 bugs found and fixed)
- `exchange_simulator/__main__.py` (228 lines) — Main entry point
- `hft-trade-bot/src/core/main.cpp` (892 lines) — HFT Trade Bot main entry point (no bugs)
- `hft-trade-bot/src/core/logger.h` (98 lines) — Thread-safe logger (no bugs)
- `hft-trade-bot/src/strategies/signal_engine_v2.h` (1159 lines) — 6-indicator composite signal engine (no bugs)
- `hft-trade-bot/src/strategies/signal_engine_v2.cpp` (138 lines) — Params validation (no bugs)
- `hft-trade-bot/src/risk/risk_manager.h` (258 lines) — Pre-trade risk checks (no bugs)
- `hft-trade-bot/src/position/position_manager.h` (119 lines) — Position tracking (no bugs)
- `hft-trade-bot/src/execution/order_executor.h` (231 lines) — WebSocket order executor (no bugs)
- `hft-trade-bot/src/data/types.h` (92 lines) — Core data structures (no bugs)
- `hft-trade-bot/src/data/signal.h` (46 lines) — Signal structure (no bugs)
- `hft-trade-bot/src/data/aligned_types.h` (268 lines) — Cache-line aligned types (no bugs)
- `hft-trade-bot/src/exchange/ExchangeBase.h` (60 lines) — Exchange base class (no bugs)
- `ai-signal-bot/src/communication/circuit_breaker.py` (138 lines) — Circuit breaker (no bugs)
- `ai-signal-bot/src/communication/signal_publisher.py` (457 lines) — WebSocket signal publisher (no bugs)
- `ai-signal-bot/src/risk/risk_manager.py` (261 lines) — Trailing stop / breakeven manager (no bugs)
- `ai-signal-bot/src/risk/position_sizing.py` (262 lines) — Dynamic position sizer (1 bug found and fixed)
- `ai-signal-bot/src/risk/var.py` (244 lines) — VaR calculator (no bugs)
- `ai-signal-bot/src/risk/kelly.py` (211 lines) — Kelly criterion sizer (no bugs)
- `ai-signal-bot/src/risk/cvar.py` (224 lines) — Conditional VaR calculator (no bugs)
- `ai-signal-bot/src/risk/stress_test.py` (258 lines) — Stress test scenarios (no bugs)
- `ai-signal-bot/src/risk/var_stress_test.py` (261 lines) — VaR stress testing (no bugs)
- `ai-signal-bot/src/risk/portfolio_optimizer.py` (295 lines) — Portfolio optimizer (no bugs)
- `ai-signal-bot/src/strategies/strategies.py` (576 lines) — Trend/mean-rev/FFT/ensemble (no bugs)
- `ai-signal-bot/src/strategies/market_making.py` (228 lines) — Avellaneda-Stoikov MM (no bugs)
- `ai-signal-bot/src/strategies/funding_arb_detector.py` (266 lines) — Funding arb detector (no bugs)
- `ai-signal-bot/src/strategies/sentiment.py` (237 lines) — Sentiment strategy (no bugs)
- `ai-signal-bot/src/strategies/marketplace.py` (248 lines) — Strategy plugin marketplace (no bugs)
- `ai-signal-bot/src/strategies/ml_ensemble.py` (551 lines) — ML ensemble with HMM regime (no bugs)
- `ai-signal-bot/src/portfolio/markowitz.py` (272 lines) — Markowitz optimizer (no bugs)
- `ai-signal-bot/src/portfolio/black_litterman.py` (207 lines) — Black-Litterman model (no bugs)
- `ai-signal-bot/src/portfolio/rebalancing.py` (246 lines) — Portfolio rebalancing (no bugs)
- `ai-signal-bot/src/portfolio/risk_parity.py` (231 lines) — Risk parity optimizer (1 bug found and fixed)
- `ai-signal-bot/src/backtesting/backtest_engine.py` (330 lines) — Full backtesting framework (no bugs)
- `ai-signal-bot/src/backtesting/pnl_calculator.py` (280 lines) — PnL calculator (no bugs)
- `ai-signal-bot/src/backtesting/backtester.py` (467 lines) — Historical replay backtester (1 bug found and fixed)
- `ai-signal-bot/src/backtesting/plotter.py` (277 lines) — Backtest visualization (no bugs)
- `ai-signal-bot/src/backtesting/optimizer.py` (222 lines) — Grid search optimizer (no bugs)
- `ai-signal-bot/src/backtesting/walk_forward.py` (157 lines) — Walk-forward analysis (no bugs)
- `ai-signal-bot/src/backtesting/backtest_comparison.py` (186 lines) — Backtest comparison (no bugs)
- `ai-signal-bot/src/backtesting/order_book_replay.py` (313 lines) — Order book replay (no bugs)

**Bug categories this session:**
- Division by zero: 9 bugs (#121-127, #132)
- O(n) list.pop(0) performance: 2 bugs (#128, #131)
- Logic error (PnL double-counting): 1 bug (#130)
- Missing zero guard on SL/TP: 1 bug (#129)
- Division by zero (position_sizing.py): 1 bug (#133) — 12 vulnerable division sites
- Division by zero (risk_parity.py): 1 bug (#134) — inf/NaN from zero marginal risk
- Division by zero (backtester.py): 1 bug (#135) — fill_price==0 edge case

## Workflow Rules

- **AUTO-COMMIT** — after EVERY file change. No exceptions.
- **6 approaches** — for each bug, generate 6 approaches, pick best
- **8 questions** — root cause analysis before fixing
- **Honest docs** — if something doesn't exist, say so
- **Static analysis only** — no terminal commands except git commit/push
