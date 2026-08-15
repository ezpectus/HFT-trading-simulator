# Cascade Notes — HFT Trading System

## Project Context

- **Project:** HFT Trading System — educational crypto HFT simulator
- **Version:** 3.0.0
- **Stack:** Python 3.12 (simulator, signal bot), C++20 (trade bot), Rust (executor), React 18 (web UI)
- **Components:** Exchange Simulator, AI Signal Bot, HFT Trade Bot, hft-executor, Web UI
- **Honest readiness:** 60% (not 85% as README badges claim)

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
- `hft-executor/src/lib.rs` — Rust order executor
- `shared_config.yaml` — global config

## Known Critical Issues (audit v4.0)

1. README.md badges inflated (75+ models → ~36+40 UI-only, 34+ strategies → 16)
2. 40+ models exist ONLY as UI (.jsx), NOT in trading pipeline
3. CUDA/ONNX — dead code behind #ifdef, never compiled
4. SVI/SABR — README claims, does NOT exist
5. ML models not trained (code exists, no weights)
6. Quantum models — 0%
7. Broker integration — 5% (FIX framework exists, not connected)
8. Real HFT features — 10% (no co-location, DMA, PTP, GPS, tick data)
9. 15 models don't exist ANYWHERE (Hurst, VPIN, Kyle's Lambda, etc.)

## Architecture Patterns

- **Communication:** WebSocket (simulator ↔ UI), SHM IPC (bot ↔ C++), FIX 4.4 (C++ framework), FFI (C++ ↔ Rust)
- **Strategies:** 10 Python (TrendFollowing, MeanReversion, FFTCycle, StatArb, MarketMaking, Sentiment, MLEnsemble, Portfolio, CrossExchangeArb, FundingArb)
- **C++ Strategies:** 6 (Signal V2, V3, Mean Rev, Momentum, Stat Arb, Market Making)
- **ML:** LSTM, Transformer, RL (PPO/DQN), AutoML, Price Predictor — NOT trained
- **Risk:** VaR, CVaR, Kelly, stress test, position sizing
- **Portfolio:** Markowitz, Black-Litterman, risk parity

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
