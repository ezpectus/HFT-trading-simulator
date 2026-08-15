# Cascade Notes — HFT Trading System

## Project Context

- **Project:** HFT Trading System — educational crypto HFT simulator
- **Version:** 3.0.0
- **Stack:** Python 3.12 (simulator, signal bot), C++20 (trade bot), Rust (executor), React 18 (web UI)
- **Components:** Exchange Simulator, AI Signal Bot, HFT Trade Bot, hft-executor, Web UI
- **Honest readiness:** 62% (v4.1 audit — not 85% as README badges originally claimed)

## Key Files

- `exchange-simulator/src/market_simulator.py` — GBM price engine
- `ai-signal-bot/src/strategies/strategies.py` — base strategy + Signal
- `ai-signal-bot/src/strategies/ml_ensemble.py` — ML ensemble + HMM + IsolationForest
- `ai-signal-bot/src/technical_analysis/indicators.py` — EMA, RSI, MACD, Bollinger, ATR, VWAP, ADX
- `ai-signal-bot/src/technical_analysis/fft_analysis.py` — FFT analysis
- `ai-signal-bot/run.py` — main entry point
- `hft-trade-bot/src/strategies/signal_engine_v2.h` — C++ indicators
- `hft-trade-bot/src/strategies/signal_engine_v3.h` — HMM regime detection
- `hft-trade-bot/src/ml/gpu_accelerator.cu` — CUDA (DEAD CODE)
- `hft-trade-bot/src/ml/onnx_engine.h` — ONNX (DEAD CODE)
- `ai-signal-bot/src/pricing/volatility_surface.py` — SVI/SABR volatility surface (EXISTS, v4.0 wrongly said missing)
- `exchange_simulator/exchange.py` — order matching, slippage, market impact, partial fills
- `exchange_simulator/market_simulator.py` — GBM + correlated multi-symbol + news events
- `hft-executor/src/lib.rs` — Rust order executor (WS stub, 0 tests)
- `shared_config.yaml` — global config

## Known Critical Issues (audit v4.1)

1. README.md badges inflated — FIXED in v4.1 (75+ models → 38+40 UI-only, 34+ strategies → 19, 197 panels → 204)
2. 40+ models exist ONLY as UI (.jsx), NOT in trading pipeline
3. CUDA/ONNX — dead code behind #ifdef, never compiled in CI
4. ~~SVI/SABR — README claims, does NOT exist~~ → ✅ EXISTS in `volatility_surface.py` (v4.1 correction)
5. ML models not trained (code exists, no weights)
6. Quantum models — 0%
7. Broker integration — 5% (FIX framework exists, not connected)
8. Real HFT features — 10% (no co-location, DMA, PTP, GPS, tick data)
9. 14 models don't exist ANYWHERE (Hurst, VPIN, Kyle's Lambda, etc. — SVI/SABR removed from this list in v4.1)
10. Rust executor — WebSocket is a stub (logs JSON, no real WS), 0 tests
11. Student-t, Merton Jump Diffusion, Heston, Markov Regime Switching — claimed in docs, NOT in code
12. collaboration/ directory in ai-signal-bot — empty (0 files)

## Architecture Patterns

- **Communication:** WebSocket (simulator ↔ UI), SHM IPC (bot ↔ C++), FIX 4.4 (C++ framework), FFI (C++ ↔ Rust)
- **Strategies:** 10 Python (TrendFollowing, MeanReversion, FFTCycle, StatArb, MarketMaking, Sentiment, MLEnsemble, Portfolio, CrossExchangeArb, FundingArb) + 3 auxiliary (Marketplace, EnsembleVoter, CircuitBreaker)
- **C++ Strategies:** 6 (Signal V2, V3, Mean Rev, Momentum, Stat Arb, Market Making)
- **Total strategies:** 19 (not 34+ as README claimed)
- **ML:** LSTM, Transformer, RL (PPO/DQN), AutoML, Price Predictor — NOT trained
- **Risk:** VaR, CVaR, Kelly, stress test, position sizing
- **Portfolio:** Markowitz, Black-Litterman, risk parity
- **Volatility:** SVI, SABR (volatility_surface.py)
- **Options:** Black-Scholes, Binomial Tree, Greeks (options_pricing.py)
- **Test files:** 138+ (54 Python + 44 C++ + 40 JS)
- **UI:** 227 React components, 204 registered panels

## Useful Commands

```bash
# Run exchange simulator
python -m exchange_simulator

# Run AI signal bot
python ai-signal-bot/run.py

# Run web UI
cd web-ui && npm run dev

# Run tests (per component)
cd exchange-simulator && python -m pytest tests/
cd ai-signal-bot && python -m pytest tests/

# Build C++ trade bot
cd hft-trade-bot && mkdir build && cd build && cmake .. && make

# Build Rust executor
cd hft-executor && cargo build --release
```

## Workflow Rules

- **AUTO-COMMIT** — after EVERY file change. No exceptions.
- **6 approaches** — for each bug, generate 6 approaches, pick best
- **8 questions** — root cause analysis before fixing
- **Honest docs** — if something doesn't exist, say so
- **Static analysis only** — no terminal commands except git commit/push
